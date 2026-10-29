import "server-only";
import { randomUUID } from "node:crypto";
import { pageFrom, statusTitle, type Label, type StatusCategory } from "@/lib/board-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/slugs";
import { botLogin, github, githubAll, GitHubError } from "./app";
import {
  boardLabels,
  closingNumbers,
  githubTarget,
  issueStatus,
  linkedEvent,
  newer,
  nextStatus,
  prState,
  repoSettings,
  stamp,
  targetLabel,
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

async function claim(r: Repo, issue: { number: number }) {
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

type OutboxRow = {
  id: number;
  number: number;
  fields: string[];
  created_at: string;
  comment_id: string | null;
  github_comment: number | null;
};

/** Sends what changed in Acta on a board's synced issues to GitHub: titles, statuses, labels and comments */
export async function flushOutbox(boardId: string) {
  const waiting = (columns: string) =>
    db().from("github_outbox").select(columns).eq("board_id", boardId).order("id").limit(200);
  const all = await waiting("id, number, fields, created_at, comment_id, github_comment");
  // Before the comments migration only fields wait here
  const { data } = all.error ? await waiting("id, number, fields, created_at") : all;
  const rows = (data ?? []) as unknown as OutboxRow[];
  if (!rows.length) return;
  await db()
    .from("github_outbox")
    .delete()
    .in(
      "id",
      rows.map((x) => x.id),
    );
  const repos = new Map<number, Promise<Repo | null>>();
  const repo = (id: number) => {
    if (!repos.has(id)) repos.set(id, repoFor(id));
    return repos.get(id)!;
  };
  await sendFields(
    boardId,
    rows.filter((x) => !x.comment_id),
    repo,
  );
  await sendComments(
    boardId,
    rows.filter((x) => x.comment_id),
    repo,
  );
}

async function sendFields(boardId: string, rows: OutboxRow[], repo: (id: number) => Promise<Repo | null>) {
  if (!rows.length) return;
  // The latest Acta change to each field of each task
  const byTask = new Map<number, Map<string, string>>();
  for (const row of rows) {
    const fields = byTask.get(row.number) ?? new Map<string, string>();
    for (const f of row.fields) fields.set(f, row.created_at);
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
  for (const l of links ?? []) {
    const r = await repo(l.repo_id);
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

// Comments made in Acta on a synced issue's task go to the issue, signed with who wrote them. Edits follow, and a
// comment deleted in Acta comes off the issue
async function sendComments(boardId: string, rows: OutboxRow[], repo: (id: number) => Promise<Repo | null>) {
  if (!rows.length) return;
  // Only the last thing that happened to each comment matters
  const last = new Map<string, OutboxRow>();
  for (const row of rows) last.set(row.comment_id!, row);
  const ids = [...last.keys()];
  const [{ data: comments }, { data: sent }, { data: links }] = await Promise.all([
    db().from("comments").select("id, number, body, author_name, via, profiles (name)").in("id", ids),
    db().from("github_issue_comments").select("comment_id, repo_id, github_id").in("comment_id", ids),
    db()
      .from("task_links")
      .select("number, ref, repo_id")
      .eq("board_id", boardId)
      .eq("kind", "issue")
      .in("number", [...new Set(rows.map((x) => x.number))]),
  ]);
  for (const [id, row] of last) {
    const was = (sent ?? []).find((x) => x.comment_id === id);
    const githubId = (was?.github_id as number | undefined) ?? row.github_comment;
    const issue = (links ?? []).find((l) => l.number === row.number);
    const repoId = (was?.repo_id as number | undefined) ?? (issue?.repo_id as number | undefined);
    const r = repoId ? await repo(repoId) : null;
    if (!r) continue;
    const path = `/repos/${r.full_name}/issues`;
    try {
      if (row.fields.includes("uncomment")) {
        if (githubId) await github(r.installation_id, `${path}/comments/${githubId}`, { method: "DELETE" }).catch(() => {});
        await db().from("github_issue_comments").delete().eq("comment_id", id);
        continue;
      }
      const c = (comments ?? []).find((x) => x.id === id);
      if (!c || !issue || !r.settings.issues || !r.settings.issueComments) continue;
      const author = (c.profiles as unknown as { name: string | null } | null)?.name;
      const name = (c.author_name as string | null) ?? author ?? "Someone";
      const via = c.via ? ` (${c.via})` : "";
      const body = `${c.body}\n\n<sub>${name}${via} via [Acta](${taskUrl(r, c.number as number)})</sub>`;
      if (githubId) {
        await github(r.installation_id, `${path}/comments/${githubId}`, { method: "PATCH", body: JSON.stringify({ body }) });
        continue;
      }
      const made = await github<{ id: number }>(r.installation_id, `${path}/${issue.ref}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      await db().from("github_issue_comments").upsert({ comment_id: id, repo_id: r.id, github_id: made.id });
    } catch (error) {
      console.error("GitHub comment sync failed", error);
    }
  }
}

// By hand: linking a pull request, issue, branch or commit to a task, and opening an issue from one. These talk to
// GitHub and record the link. The task's own changes go back to the caller, which saves them as whoever asked, a
// person or an agent's key

/** A mistake the person or agent can fix */
export class LinkProblem extends Error {}

/** What a link did: a short name for it, and the task's changes for the caller to save */
export type ByHand = { label: string; url: string; changes: Record<string, unknown> };

async function boardRepos(boardId: string) {
  const { data } = await db().from("github_repos").select("id").eq("board_id", boardId).order("full_name");
  const repos = await Promise.all((data ?? []).map((x) => repoFor(x.id as number)));
  return repos.filter((r): r is Repo => Boolean(r));
}

async function from404<T>(r: Repo, path: string, what: string) {
  try {
    return await github<T>(r.installation_id, path);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) throw new LinkProblem(`GitHub can’t find ${what}.`);
    throw error;
  }
}

/** Links a pull request, issue, branch or commit to a task by its address on GitHub, and moves the task along as
 * if it had named the task itself */
export async function linkByHand(boardId: string, number: number, href: string): Promise<ByHand> {
  const target = githubTarget(href);
  if (!target) throw new LinkProblem("That isn’t a link to a pull request, issue, branch or commit on GitHub.");
  const repos = await boardRepos(boardId);
  const r = repos.find((x) => x.full_name.toLowerCase() === target.repo.toLowerCase());
  if (!r)
    throw new LinkProblem(
      repos.length
        ? `${target.repo} isn’t linked to this board. Its repositories: ${repos.map((x) => x.full_name).join(", ")}.`
        : "No GitHub repository is linked to this board. Link one in the workspace’s settings.",
    );
  const [t] = await tasksAmong(r, [number]);
  if (!t) throw new LinkProblem(`There’s no task ${r.board.prefix}-${number}.`);
  const base = `/repos/${r.full_name}`;
  let { kind, ref } = target;
  let fields: Parameters<typeof link>[4] = { url: href };
  const closes = new Set<number>();

  if (kind === "issue") {
    const issue = await from404<Payload>(r, `${base}/issues/${ref}`, `issue #${ref}`);
    // Pull requests are issues too, as far as GitHub's addresses go
    if (issue.pull_request) kind = "pr";
    else {
      const taken = await issueLink(r, Number(ref));
      if (taken && taken.number !== number)
        throw new LinkProblem(`Issue #${ref} already syncs with ${r.board.prefix}-${taken.number}.`);
      const { data: own } = await db()
        .from("task_links")
        .select("ref, repo_id")
        .eq("board_id", boardId)
        .eq("number", number)
        .eq("kind", "issue")
        .limit(1);
      if (own?.length && !(own[0].repo_id === r.id && own[0].ref === ref))
        throw new LinkProblem(`${r.board.prefix}-${number} already syncs with issue #${own[0].ref}. A task follows one issue.`);
      // So the issue isn't brought over as a task of its own later
      await claim(r, { number: Number(ref) });
      const at = new Date().toISOString();
      fields = {
        url: issue.html_url,
        title: issue.title,
        state: issue.state,
        author: issue.user?.login,
        extra: { github: { title: at, status: at, labels: at } } satisfies FieldTimes,
      };
    }
  }
  if (kind === "pr") {
    const pr = await from404<Payload>(r, `${base}/pulls/${ref}`, `pull request #${ref}`);
    fields = {
      url: pr.html_url,
      title: pr.title,
      state: prState(pr as { state: string }),
      author: pr.user?.login,
      extra: { branch: pr.head?.ref, draft: Boolean(pr.draft) },
    };
    if ([...closingNumbers(pr.body, r.board.prefix), ...closingNumbers(pr.title, r.board.prefix)].includes(number))
      closes.add(number);
  }
  if (kind === "branch") {
    await from404<Payload>(r, `${base}/branches/${encodeURIComponent(ref)}`, `a branch called ${ref}`);
    fields = { url: `https://github.com/${r.full_name}/tree/${ref}`, title: ref };
  }
  if (kind === "commit") {
    const c = await from404<Payload>(r, `${base}/commits/${ref}`, `commit ${ref.slice(0, 7)}`);
    ref = String(c.sha);
    fields = { url: c.html_url, title: String(c.commit?.message ?? "").split("\n")[0], author: c.author?.login };
  }

  await link(r, [number], kind, ref, fields, closes);
  const label = targetLabel({ repo: r.full_name, kind, ref });
  const event = linkedEvent(kind, fields.state);
  const to = event ? nextStatus(t.status, event, r.settings) : null;
  return {
    label,
    url: fields.url,
    changes: {
      updated: to
        ? [{ number, fields: { status: to, ...(to === "done" ? { shipped_on: new Date().toISOString().slice(0, 10) } : {}) } }]
        : [],
      order: to ? [{ number, position: await columnEnd(r, to) }] : [],
      activity: [
        { id: randomUUID(), number, text: `linked ${label}${to ? ` and moved it to ${statusTitle[to]}` : ""}`.slice(0, 300) },
      ],
    },
  };
}

/** Takes a link off a task, by its address or its id. What happened on GitHub stays as it was */
export async function unlinkByHand(boardId: string, number: number, which: { url: string } | { id: string }): Promise<ByHand> {
  let q = db()
    .from("task_links")
    .select("id, kind, ref, url, github_repos (full_name)")
    .eq("board_id", boardId)
    .eq("number", number);
  let repo: string | null = null;
  if ("id" in which) q = q.eq("id", which.id);
  else {
    const target = githubTarget(which.url);
    if (!target) throw new LinkProblem("That isn’t a link to a pull request, issue, branch or commit on GitHub.");
    repo = target.repo.toLowerCase();
    // An issue's address can be a pull request's, and a commit's can be cut short
    if (target.kind === "issue") q = q.in("kind", ["issue", "pr"]).eq("ref", target.ref);
    else if (target.kind === "commit") q = q.eq("kind", "commit").like("ref", `${target.ref}%`);
    else q = q.eq("kind", target.kind).eq("ref", target.ref);
  }
  const { data } = await q;
  const name = (l: { github_repos: unknown }) => (l.github_repos as { full_name: string } | null)?.full_name ?? "";
  const found = (data ?? []).filter((l) => !repo || name(l).toLowerCase() === repo);
  if (!found.length) throw new LinkProblem("That isn’t linked to this task.");
  await db()
    .from("task_links")
    .delete()
    .in(
      "id",
      found.map((l) => l.id),
    );
  const l = found[0];
  const label = targetLabel({ repo: name(l), kind: l.kind, ref: l.ref });
  return {
    label,
    url: l.url,
    changes: { activity: [{ id: randomUUID(), number, text: `unlinked ${label}`.slice(0, 300) }] },
  };
}

/** Opens a GitHub issue from a task and keeps the two in step from then on */
export async function openIssueByHand(boardId: string, number: number, repoName?: string): Promise<ByHand> {
  const repos = (await boardRepos(boardId)).filter((r) => r.settings.issues);
  if (!repos.length)
    throw new LinkProblem("None of this board’s repositories sync issues. Turn that on for one in the workspace’s settings.");
  const wanted = repoName?.trim().toLowerCase();
  const r = wanted
    ? repos.find((x) => x.full_name.toLowerCase() === wanted || x.full_name.split("/")[1].toLowerCase() === wanted)
    : repos.length === 1
      ? repos[0]
      : undefined;
  if (!r)
    throw new LinkProblem(
      `${wanted ? `${repoName} doesn’t sync issues with this board.` : "Say which repository."} These do: ${repos.map((x) => x.full_name).join(", ")}.`,
    );
  const { data: t } = await db()
    .from("tasks")
    .select("number, title, description, labels, status, public")
    .eq("board_id", boardId)
    .eq("number", number)
    .is("deleted_at", null)
    .maybeSingle();
  if (!t) throw new LinkProblem(`There’s no task ${r.board.prefix}-${number}.`);
  const { data: had } = await db()
    .from("task_links")
    .select("ref")
    .eq("board_id", boardId)
    .eq("number", number)
    .eq("kind", "issue")
    .limit(1);
  if (had?.length) throw new LinkProblem(`${r.board.prefix}-${number} already syncs with issue #${had[0].ref}.`);

  // Only labels the repository has, spelled its way
  const known = await githubAll<{ name: string }>(r.installation_id, `/repos/${r.full_name}/labels`, 300).catch(() => []);
  const labels = (t.labels as string[])
    .map((l) => known.find((k) => k.name.toLowerCase() === l.toLowerCase())?.name)
    .filter((l): l is string => Boolean(l));
  const id = `${r.board.prefix}-${number}`;
  const body = [String(t.description ?? "").trim(), `---\n[${id}](${taskUrl(r, number)}) in Acta`].filter(Boolean).join("\n\n");
  const issue = await github<Payload>(r.installation_id, `/repos/${r.full_name}/issues`, {
    method: "POST",
    body: JSON.stringify({ title: t.title, body: body.slice(0, 60000), labels }),
  });
  await claim(r, { number: issue.number });
  const finished = t.status === "done" || t.status === "canceled";
  if (finished)
    await github(r.installation_id, `/repos/${r.full_name}/issues/${issue.number}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed", state_reason: t.status === "done" ? "completed" : "not_planned" }),
    }).catch(() => {});
  const at = new Date().toISOString();
  await link(r, [number], "issue", String(issue.number), {
    url: issue.html_url,
    title: issue.title,
    state: finished ? "closed" : issue.state,
    author: issue.user?.login,
    extra: { github: { title: at, status: at, labels: at } } satisfies FieldTimes,
  });
  const label = `${r.full_name.split("/")[1]}#${issue.number}`;
  // A private repository's issue isn't for the public roadmap
  const hide = r.private && t.public;
  return {
    label,
    url: issue.html_url,
    changes: {
      updated: hide ? [{ number, fields: { public: false } }] : [],
      activity: [
        {
          id: randomUUID(),
          number,
          text: `opened issue ${label} on GitHub${hide ? " and took the task off the public roadmap, since the repository is private" : ""}`,
        },
      ],
    },
  };
}
