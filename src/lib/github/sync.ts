import "server-only";
import { randomUUID } from "node:crypto";
import { pageFrom, statusTitle, type Label, type StatusCategory } from "@/lib/board-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/slugs";
import { botLogin, github, githubAll } from "./app";
import {
  boardLabels,
  closingNumbers,
  issueStatus,
  newer,
  nextStatus,
  prState,
  repoSettings,
  stamp,
  taskNumbers,
  type DevEvent,
  type FieldTimes,
  type RepoSettings,
} from "./match";

// What GitHub's webhooks do to tasks, and what Acta sends back. Each change to a task goes through github_apply,
// the same checked write path people and agents use, marked "via GitHub"

/* eslint-disable @typescript-eslint/no-explicit-any -- GitHub's payloads are large and only partly read */
type Payload = Record<string, any>;

let admin: ReturnType<typeof createAdminClient> | null = null;
const db = () => (admin ??= createAdminClient());

type Board = {
  id: string;
  slug: string;
  name: string;
  prefix: string;
  next_number: number;
  labels: Label[] | null;
  page: object;
  workspace_id: string;
  workspaces: { slug: string };
};

type Repo = {
  id: number;
  installation_id: number;
  full_name: string;
  private: boolean;
  settings: RepoSettings;
  board: Board;
};

type TaskRow = { number: number; title: string; status: StatusCategory; labels: string[]; position: number };

type LinkRow = {
  id: string;
  number: number;
  kind: string;
  ref: string;
  closes: boolean;
  extra: Record<string, unknown>;
};

async function repoFor(id: number): Promise<Repo | null> {
  const { data } = await db()
    .from("github_repos")
    .select(
      "id, installation_id, full_name, private, settings, boards (id, slug, name, prefix, next_number, labels, page, workspace_id, workspaces (slug))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const { boards, settings, ...rest } = data as any;
  return { ...rest, settings: repoSettings(settings), board: boards as Board };
}

const taskUrl = (r: Repo, n: number) => `${siteUrl}/${r.board.workspaces.slug}/${r.board.slug}#${r.board.prefix}-${n}`;

async function tasksAmong(r: Repo, numbers: number[]): Promise<TaskRow[]> {
  if (!numbers.length) return [];
  const { data } = await db()
    .from("tasks")
    .select("number, title, status, labels, position")
    .eq("board_id", r.board.id)
    .in("number", numbers)
    .is("deleted_at", null);
  return (data ?? []) as TaskRow[];
}

// The member a GitHub account belongs to, if they linked it
async function memberFor(r: Repo, user: Payload | undefined) {
  if (!user?.id) return null;
  const { data } = await db().rpc("github_member", { p_workspace: r.board.workspace_id, p_github_id: String(user.id) });
  return (data as string | null) ?? null;
}

async function apply(r: Repo, actor: string | null, changes: Record<string, unknown>) {
  const { data, error } = await db().rpc("github_apply", { p_repo: r.id, p_actor: actor, p_changes: changes });
  if (error) throw new Error(`github_apply: ${error.message}`);
  return data as { moved: Record<string, number> };
}

// The end of a column, where a task moved there goes
async function columnEnd(r: Repo, status: StatusCategory) {
  const { data } = await db()
    .from("tasks")
    .select("position")
    .eq("board_id", r.board.id)
    .eq("status", status)
    .is("deleted_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data?.position as number | undefined) ?? -1) + 1;
}

async function linksFor(r: Repo, kind: string, ref: string): Promise<LinkRow[]> {
  const { data } = await db()
    .from("task_links")
    .select("id, number, kind, ref, closes, extra")
    .eq("repo_id", r.id)
    .eq("kind", kind)
    .eq("ref", ref);
  return (data ?? []) as LinkRow[];
}

// Records a link on each task, keeping what earlier events said about it
async function link(
  r: Repo,
  numbers: number[],
  kind: string,
  ref: string,
  fields: { url: string; title?: string; state?: string; author?: string; extra?: Record<string, unknown> },
  closes: Set<number> = new Set(),
) {
  if (!numbers.length) return;
  const known = new Map((await linksFor(r, kind, ref)).map((l) => [l.number, l]));
  const { error } = await db()
    .from("task_links")
    .upsert(
      numbers.map((number) => ({
        board_id: r.board.id,
        number,
        repo_id: r.id,
        kind,
        ref,
        url: fields.url,
        title: fields.title?.slice(0, 500) ?? null,
        state: fields.state ?? null,
        author: fields.author ?? null,
        closes: closes.has(number),
        extra: { ...known.get(number)?.extra, ...fields.extra },
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "board_id,number,repo_id,kind,ref" },
    );
  if (error) throw new Error(`task_links: ${error.message}`);
}

// Moves tasks forward after something happened on GitHub, never back
async function advance(r: Repo, tasks: TaskRow[], event: DevEvent, why: string, actor: string | null, at?: string) {
  const updated: Record<string, unknown>[] = [];
  const order: { number: number; position: number }[] = [];
  const activity: Record<string, unknown>[] = [];
  const ends = new Map<StatusCategory, number>();
  for (const t of tasks) {
    const to = nextStatus(t.status, event, r.settings);
    if (!to) continue;
    if (!ends.has(to)) ends.set(to, await columnEnd(r, to));
    const position = ends.get(to)!;
    ends.set(to, position + 1);
    updated.push({
      number: t.number,
      fields: { status: to, ...(to === "done" ? { shipped_on: (at ?? new Date().toISOString()).slice(0, 10) } : {}) },
    });
    order.push({ number: t.number, position });
    activity.push({ id: randomUUID(), number: t.number, text: `moved it to ${statusTitle[to]} (${why})` });
  }
  if (updated.length) await apply(r, actor, { updated, order, activity });
}

async function note(r: Repo, numbers: number[], text: string, actor: string | null) {
  if (numbers.length)
    await apply(r, actor, { activity: numbers.map((number) => ({ id: randomUUID(), number, text: text.slice(0, 300) })) });
}

// Pull requests

async function onPullRequest(r: Repo, p: Payload) {
  const pr = p.pull_request;
  const prefix = r.board.prefix;
  const closes = new Set([...closingNumbers(pr.body, prefix), ...closingNumbers(pr.title, prefix)]);
  // The branch, the title or a closing keyword make it this task's pull request. A mention elsewhere only links it
  const owned = new Set([...taskNumbers(pr.title, prefix), ...taskNumbers(pr.head?.ref, prefix), ...closes]);
  const mentioned = new Set([...owned, ...taskNumbers(pr.body, prefix)]);
  const tasks = await tasksAmong(r, [...mentioned]);
  if (!tasks.length) return;
  const state = prState(pr);
  const ref = String(pr.number);
  await link(
    r,
    tasks.map((t) => t.number),
    "pr",
    ref,
    {
      url: pr.html_url,
      title: pr.title,
      state,
      author: pr.user?.login,
      extra: { branch: pr.head?.ref, draft: Boolean(pr.draft) },
    },
    closes,
  );

  const mine = tasks.filter((t) => owned.has(t.number));
  const actor = await memberFor(r, p.sender);
  const why = `pull request #${pr.number}`;
  if (p.action === "closed") {
    if (state === "merged") await advance(r, mine, "merged", `${why} merged`, actor, pr.merged_at);
    else await note(r, mine.map((t) => t.number), `closed ${why} without merging`, actor);
  } else if (["opened", "reopened", "ready_for_review", "converted_to_draft"].includes(p.action)) {
    await advance(r, mine, state === "draft" ? "started" : "ready", why, actor);
  }
  if (r.settings.comment && ["opened", "edited", "reopened", "ready_for_review"].includes(p.action))
    await commentOn(r, pr.number, tasks);
}

// One comment per pull request listing its tasks, edited as the list changes
async function commentOn(r: Repo, number: number, tasks: TaskRow[]) {
  const lines = tasks
    .sort((a, b) => a.number - b.number)
    .map((t) => `- [${r.board.prefix}-${t.number}](${taskUrl(r, t.number)}) ${t.title.replace(/[\r\n]+/g, " ")}`);
  const body = `**Acta** · ${r.board.name}\n\n${lines.join("\n")}`;
  const { data } = await db()
    .from("github_comments")
    .select("comment_id")
    .eq("repo_id", r.id)
    .eq("number", number)
    .maybeSingle();
  const path = `/repos/${r.full_name}/issues`;
  if (data) {
    await github(r.installation_id, `${path}/comments/${data.comment_id}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    }).catch(() => {});
    return;
  }
  const made = await github<{ id: number }>(r.installation_id, `${path}/${number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  await db().from("github_comments").upsert({ repo_id: r.id, number, comment_id: made.id });
}

async function onReview(r: Repo, p: Payload) {
  const review = String(p.review?.state ?? "").toLowerCase();
  if (review !== "approved" && review !== "changes_requested") return;
  for (const l of await linksFor(r, "pr", String(p.pull_request.number)))
    await db()
      .from("task_links")
      .update({ extra: { ...l.extra, review }, updated_at: new Date().toISOString() })
      .eq("id", l.id);
}

async function onChecks(r: Repo, p: Payload) {
  const suite = p.check_suite;
  if (p.action !== "completed" || !suite) return;
  for (const pr of suite.pull_requests ?? [])
    for (const l of await linksFor(r, "pr", String(pr.number)))
      await db()
        .from("task_links")
        .update({ extra: { ...l.extra, checks: suite.conclusion ?? "neutral" }, updated_at: new Date().toISOString() })
        .eq("id", l.id);
}

// Branches and commits

async function onBranch(r: Repo, p: Payload) {
  if (p.ref_type !== "branch") return;
  const tasks = await tasksAmong(r, taskNumbers(p.ref, r.board.prefix));
  if (!tasks.length) return;
  const url = `${p.repository.html_url}/tree/${encodeURIComponent(p.ref).replace(/%2F/g, "/")}`;
  await link(r, tasks.map((t) => t.number), "branch", p.ref, { url, title: p.ref, author: p.sender?.login });
  await advance(r, tasks, "started", `branch ${p.ref}`, await memberFor(r, p.sender));
}

async function onPush(r: Repo, p: Payload) {
  if (p.deleted) return;
  const actor = await memberFor(r, p.sender);
  for (const c of (p.commits ?? []).slice(0, 20)) {
    const tasks = await tasksAmong(r, taskNumbers(c.message, r.board.prefix));
    if (!tasks.length) continue;
    const title = String(c.message).split("\n")[0];
    await link(r, tasks.map((t) => t.number), "commit", c.id, { url: c.url, title, author: c.author?.username });
    await advance(r, tasks, "started", `commit ${String(c.id).slice(0, 7)}`, actor);
  }
}

// Issues

async function claim(r: Repo, issue: Payload) {
  const { data } = await db()
    .from("github_deliveries")
    .upsert({ id: `issue:${r.id}:${issue.number}` }, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  return Boolean(data?.length);
}

const issueLink = async (r: Repo, number: number) => (await linksFor(r, "issue", String(number)))[0] ?? null;

function wanted(r: Repo, issue: Payload) {
  if (issue.pull_request) return false;
  const label = r.settings.issueLabel?.toLowerCase();
  return !label || (issue.labels ?? []).some((l: Payload) => String(l.name).toLowerCase() === label);
}

/** Brings issues onto the board as tasks, with their history and comments */
async function createFromIssues(r: Repo, issues: Payload[], withComments: boolean) {
  const { data: fresh } = await db().from("boards").select("next_number").eq("id", r.board.id).single();
  let next = (fresh?.next_number as number | undefined) ?? r.board.next_number;
  const isPublic = r.private ? false : pageFrom(r.board.name, r.board.slug, r.board.page).newTasksPublic;
  const names = (r.board.labels ?? []).map((l) => l.id);
  const ends = new Map<StatusCategory, number>();
  for (let i = 0; i < issues.length; i += 25) {
    const batch = issues.slice(i, i + 25);
    const created: Record<string, unknown>[] = [];
    const comments: Record<string, unknown>[] = [];
    const activity: Record<string, unknown>[] = [];
    for (const issue of batch) {
      const status = issueStatus(issue as { state: string });
      if (!ends.has(status)) ends.set(status, await columnEnd(r, status));
      const position = ends.get(status)!;
      ends.set(status, position + 1);
      const number = next++;
      created.push({
        number,
        title: String(issue.title).slice(0, 500) || `Issue #${issue.number}`,
        status,
        priority: "none",
        labels: boardLabels(issue.labels ?? [], names),
        description: String(issue.body ?? "").slice(0, 20000),
        subtasks: [],
        public: isPublic,
        assignee: await memberFor(r, issue.assignee ?? undefined),
        shipped_on: status === "done" ? String(issue.closed_at ?? new Date().toISOString()).slice(0, 10) : null,
        position,
        created_at: issue.created_at,
      });
      activity.push({
        id: randomUUID(),
        number,
        text: `brought over issue #${issue.number} from ${r.full_name}`,
        created_at: issue.created_at,
      });
      if (withComments && issue.comments > 0)
        for (const c of await githubAll<Payload>(r.installation_id, `/repos/${r.full_name}/issues/${issue.number}/comments`, 100))
          if (c.user?.login !== botLogin())
            comments.push({
              id: randomUUID(),
              number,
              body: String(c.body ?? "").slice(0, 10000) || "(empty)",
              author_name: String(c.user?.login ?? "GitHub").slice(0, 60),
              created_at: c.created_at,
            });
    }
    const { moved } = await apply(r, null, { created, comments, activity });
    const at = new Date().toISOString();
    for (const [j, issue] of batch.entries()) {
      const was = created[j].number as number;
      const number = moved[String(was)] ?? was;
      await link(r, [number], "issue", String(issue.number), {
        url: issue.html_url,
        title: issue.title,
        state: issue.state,
        author: issue.user?.login,
        extra: { github: { title: at, status: at, labels: at } } satisfies FieldTimes,
      });
    }
  }
}

/** The first import when a repository starts syncing its issues */
export async function importIssues(repoId: number) {
  const r = await repoFor(repoId);
  if (!r || !r.settings.issues) return 0;
  const label = r.settings.issueLabel ? `&labels=${encodeURIComponent(r.settings.issueLabel)}` : "";
  const all = await githubAll<Payload>(r.installation_id, `/repos/${r.full_name}/issues?state=all&direction=asc${label}`, 300);
  const { data: linked } = await db().from("task_links").select("ref").eq("repo_id", r.id).eq("kind", "issue");
  const have = new Set((linked ?? []).map((l) => l.ref as string));
  const fresh = all.filter((i) => !i.pull_request && !have.has(String(i.number)));
  // Comments come along for the first hundred, which keeps an import inside GitHub's limits
  await createFromIssues(r, fresh.slice(0, 100), true);
  if (fresh.length > 100) await createFromIssues(r, fresh.slice(100), false);
  return fresh.length;
}

async function onIssue(r: Repo, p: Payload) {
  if (!r.settings.issues) return;
  const issue = p.issue;
  if (issue.pull_request) return;
  const found = await issueLink(r, issue.number);
  if (!found) {
    // An issue opened with labels sends several events at once, and only the first may bring it over
    if (["opened", "reopened", "labeled", "edited"].includes(p.action) && wanted(r, issue) && (await claim(r, issue)))
      await createFromIssues(r, [issue], false);
    return;
  }
  const [task] = await tasksAmong(r, [found.number]);
  if (!task) return;
  const at = issue.updated_at ?? new Date().toISOString();
  let times = (found.extra ?? {}) as FieldTimes;
  const fields: Record<string, unknown> = {};
  const notes: string[] = [];
  let order: { number: number; position: number }[] = [];
  const actor = await memberFor(r, p.sender);

  if (p.action === "edited" && p.changes?.title && newer(times, "title", "github", at) && issue.title !== task.title) {
    fields.title = String(issue.title).slice(0, 500);
    notes.push("renamed the task to match the issue");
    times = stamp(times, "title", "github", at);
  }
  if (p.action === "edited" && p.changes?.body) {
    fields.description = String(issue.body ?? "").slice(0, 20000);
    notes.push("edited the description to match the issue");
  }
  if ((p.action === "closed" || p.action === "reopened") && newer(times, "status", "github", at)) {
    const to = issueStatus(issue);
    if (to !== task.status && !(to === "todo" && !["done", "canceled"].includes(task.status))) {
      fields.status = to;
      fields.shipped_on = to === "done" ? String(issue.closed_at ?? at).slice(0, 10) : null;
      notes.push(`moved it to ${statusTitle[to]} (issue #${issue.number} ${p.action})`);
      order = [{ number: task.number, position: await columnEnd(r, to) }];
    }
    times = stamp(times, "status", "github", at);
  }
  if ((p.action === "labeled" || p.action === "unlabeled") && newer(times, "labels", "github", at)) {
    const next = boardLabels(issue.labels ?? [], (r.board.labels ?? []).map((l) => l.id));
    if (next.join("\u0000") !== task.labels.join("\u0000")) {
      fields.labels = next;
      notes.push("matched the labels to the issue");
    }
    times = stamp(times, "labels", "github", at);
  }
  if (p.action === "deleted") notes.push(`issue #${issue.number} was deleted on GitHub`);

  if (Object.keys(fields).length || notes.length)
    await apply(r, actor, {
      updated: Object.keys(fields).length ? [{ number: task.number, fields }] : [],
      order,
      activity: notes.map((text) => ({ id: randomUUID(), number: task.number, text })),
    });
  await db()
    .from("task_links")
    .update({ title: issue.title, state: issue.state, extra: times, updated_at: new Date().toISOString() })
    .eq("id", found.id);
}

async function onIssueComment(r: Repo, p: Payload) {
  if (!r.settings.issues || p.action !== "created" || p.issue?.pull_request) return;
  const found = await issueLink(r, p.issue.number);
  if (!found) return;
  const c = p.comment;
  await apply(r, await memberFor(r, c.user), {
    comments: [
      {
        id: randomUUID(),
        number: found.number,
        body: String(c.body ?? "").slice(0, 10000) || "(empty)",
        author_name: String(c.user?.login ?? "GitHub").slice(0, 60),
        created_at: c.created_at,
      },
    ],
    activity: [{ id: randomUUID(), number: found.number, text: "commented" }],
  });
}

// Installations

async function onInstallation(p: Payload) {
  if (p.action === "deleted") await db().from("github_installations").delete().eq("id", p.installation.id);
}

async function onInstallationRepos(p: Payload) {
  const gone = (p.repositories_removed ?? []).map((x: Payload) => x.id);
  if (gone.length) await db().from("github_repos").delete().in("id", gone);
}

/** Handles one webhook delivery. Deliveries GitHub sends again are skipped */
export async function handleDelivery(event: string, delivery: string, p: Payload) {
  const { data: first } = await db()
    .from("github_deliveries")
    .upsert({ id: delivery }, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (!first?.length) return;
  // Old deliveries are forgotten now and then
  if (Math.random() < 0.02)
    await db()
      .from("github_deliveries")
      .delete()
      .lt("received_at", new Date(Date.now() - 30 * 86_400_000).toISOString());

  if (event === "installation") return onInstallation(p);
  if (event === "installation_repositories") return onInstallationRepos(p);
  // Acta's own changes come back as webhooks too, and going round again would never end
  if (p.sender?.login === botLogin()) return;
  if (!p.repository?.id) return;
  const r = await repoFor(p.repository.id);
  if (!r) return;
  switch (event) {
    case "pull_request":
      return onPullRequest(r, p);
    case "pull_request_review":
      return onReview(r, p);
    case "check_suite":
      return onChecks(r, p);
    case "create":
      return onBranch(r, p);
    case "push":
      return onPush(r, p);
    case "issues":
      return onIssue(r, p);
    case "issue_comment":
      return onIssueComment(r, p);
  }
}

// Acta to GitHub

/** Sends what changed in Acta on a board's synced issues to GitHub */
export async function flushOutbox(boardId: string) {
  const { data: rows } = await db()
    .from("github_outbox")
    .select("id, number, fields, created_at")
    .eq("board_id", boardId)
    .order("id")
    .limit(200);
  if (!rows?.length) return;
  await db()
    .from("github_outbox")
    .delete()
    .in(
      "id",
      rows.map((x) => x.id),
    );

  // The latest Acta change to each field of each task
  const byTask = new Map<number, Map<string, string>>();
  for (const row of rows) {
    const fields = byTask.get(row.number) ?? new Map<string, string>();
    for (const f of row.fields as string[]) fields.set(f, row.created_at as string);
    byTask.set(row.number, fields);
  }

  const { data: links } = await db()
    .from("task_links")
    .select("id, number, ref, extra, repo_id")
    .eq("board_id", boardId)
    .eq("kind", "issue")
    .in("number", [...byTask.keys()]);
  const { data: tasks } = await db()
    .from("tasks")
    .select("number, title, status, labels")
    .eq("board_id", boardId)
    .in("number", [...byTask.keys()]);
  const repos = new Map<number, Repo | null>();
  for (const l of links ?? []) {
    if (!repos.has(l.repo_id)) repos.set(l.repo_id, await repoFor(l.repo_id));
    const r = repos.get(l.repo_id);
    const t = (tasks ?? []).find((x) => x.number === l.number);
    if (!r || !t) continue;
    let times = (l.extra ?? {}) as FieldTimes;
    const patch: Record<string, unknown> = {};
    for (const [field, at] of byTask.get(l.number) ?? []) {
      if (!newer(times, field, "acta", at)) continue;
      times = stamp(times, field, "acta", at);
      if (field === "title") patch.title = t.title;
      if (field === "status") {
        if (t.status === "done") Object.assign(patch, { state: "closed", state_reason: "completed" });
        else if (t.status === "canceled") Object.assign(patch, { state: "closed", state_reason: "not_planned" });
        else Object.assign(patch, { state: "open" });
      }
      if (field === "labels") {
        // Labels the board doesn't know stay on the issue
        const issue = await github<Payload>(r.installation_id, `/repos/${r.full_name}/issues/${l.ref}`);
        const ours = new Set((r.board.labels ?? []).map((x) => x.id.toLowerCase()));
        const theirs = (issue.labels ?? []).map((x: Payload) => String(x.name)).filter((n: string) => !ours.has(n.toLowerCase()));
        patch.labels = [...theirs, ...(t.labels as string[])];
      }
    }
    if (!Object.keys(patch).length) continue;
    await github(r.installation_id, `/repos/${r.full_name}/issues/${l.ref}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).catch((error) => console.error("GitHub issue update failed", error));
    await db().from("task_links").update({ extra: times }).eq("id", l.id);
  }
}
