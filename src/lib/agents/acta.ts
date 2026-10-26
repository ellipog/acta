import "server-only";
import { randomUUID } from "node:crypto";
import {
  formatDue,
  pageFrom,
  priorities,
  statusTitle,
  type Label,
  type Priority,
  type Project,
  type Size,
  type StatusCategory,
  type Subtask,
  type Tone,
} from "@/lib/board-store";
import { boardSlugProblem, publicHref, siteUrl, slugify } from "@/lib/slugs";
import { accessRank, agentDb, type Access, type Agent } from "./keys";

// A mistake the agent can fix. Its message goes back to the agent as is
export class Problem extends Error {}

export const openStatuses: StatusCategory[] = ["todo", "in_progress", "review"];
export const taskStatuses = ["todo", "in_progress", "review", "done"] as const;
const tones: Tone[] = ["lapis", "pyrite", "malachite", "hematite"];

type Role = "owner" | "admin" | "member";
type Place = { id: string; slug: string; name: string; role: Role };
type Person = { id: string; name: string; role: Role };

type BoardRow = {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  prefix: string;
  next_number: number;
  labels: Label[] | null;
  projects: Project[] | null;
  roadmap_public: boolean;
  page: Record<string, unknown>;
};
export type Board = BoardRow & { workspace: Place; ref: string };

type TaskRow = {
  number: number;
  title: string;
  status: StatusCategory;
  priority: Priority;
  size: Size | null;
  project: string | null;
  labels: string[];
  start_on: string | null;
  due_on: string | null;
  assignee: string | null;
  description: string;
  subtasks: Subtask[];
  public: boolean;
  shipped_on: string | null;
  vote_count: number;
  created_at: string;
  updated_at: string;
};

export type TaskInput = {
  title?: string;
  description?: string;
  status?: StatusCategory;
  priority?: Priority;
  size?: Size | null;
  project?: string | null;
  labels?: string[];
  assignee?: string | null;
  start?: string | null;
  due?: string | null;
  public?: boolean;
};

export type TaskPatch = TaskInput & {
  add_labels?: string[];
  remove_labels?: string[];
  add_subtasks?: string[];
  complete_subtasks?: string[];
  reopen_subtasks?: string[];
};

export type Filters = {
  status?: StatusCategory[];
  assignee?: string;
  label?: string;
  project?: string;
  query?: string;
  limit?: number;
};

const boardFields = "id, workspace_id, slug, name, prefix, next_number, labels, projects, roadmap_public, page";
const listFields =
  "number, title, status, priority, size, project, labels, start_on, due_on, assignee, subtasks, public, shipped_on, vote_count, created_at, updated_at";

const today = () => new Date().toISOString().slice(0, 10);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const statusRank = Object.fromEntries(["backlog", ...taskStatuses].map((s, i) => [s, i]));

// Leaves out empty values so results stay short
function compact<T extends Record<string, unknown>>(o: T) {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)),
  ) as Partial<T>;
}

function day(value: string | null | undefined, field: string) {
  if (value === undefined || value === null || value === "") return value === undefined ? undefined : null;
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  if (!ok) throw new Problem(`${field} must be a date like 2026-11-02.`);
  return value;
}

function boardRef(ref: string) {
  let path = ref
    .trim()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/[?#].*$/, "")
    .replace(/^\/+|\/+$/g, "");
  if (path.startsWith("p/")) path = path.slice(2);
  const [workspace, board, ...rest] = path.split("/");
  if (!workspace || !board || rest.length)
    throw new Problem(`“${ref}” isn’t a board. Use "workspace/board", as listed by list_boards.`);
  return { workspace, board };
}

function dbProblem(error: { code?: string; message: string }) {
  if (["42501", "28000", "P0001", "P0002", "23514", "22P02", "22007", "22008"].includes(error.code ?? ""))
    return new Problem(error.message);
  return new Error(error.message);
}

export function actaFor(agent: Agent) {
  const db = agentDb();
  const can = (need: Access) => accessRank[agent.access] >= accessRank[need];

  let places: Promise<Place[]> | null = null;
  const workspaces = () =>
    (places ??= (async () => {
      const { data, error } = await db
        .from("members")
        .select("role, created_at, workspaces (id, slug, name)")
        .eq("user_id", agent.userId)
        .order("created_at");
      if (error) throw dbProblem(error);
      return (data ?? [])
        .map((m) => ({ ...(m.workspaces as unknown as Omit<Place, "role">), role: m.role as Role }))
        .filter((w) => w.id && (!agent.workspaces || agent.workspaces.includes(w.id)));
    })());

  const crowd = new Map<string, Promise<Person[]>>();
  const people = (workspaceId: string) => {
    if (!crowd.has(workspaceId))
      crowd.set(
        workspaceId,
        (async () => {
          const { data } = await db
            .from("members")
            .select("user_id, role, created_at, profiles (name)")
            .eq("workspace_id", workspaceId)
            .order("created_at");
          return (data ?? []).map((m) => ({
            id: m.user_id as string,
            name: (m.profiles as unknown as { name: string | null } | null)?.name || "Member",
            role: m.role as Role,
          }));
        })(),
      );
    return crowd.get(workspaceId)!;
  };

  async function nameOf(workspaceId: string) {
    const list = await people(workspaceId);
    const names = new Map(list.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (names.get(id) ?? "Former member") : undefined);
  }

  async function place(slug: string) {
    const list = await workspaces();
    const found = list.find((w) => w.slug === slug);
    if (!found)
      throw new Problem(
        `This key can’t reach a workspace called “${slug}”. It can reach: ${list.map((w) => w.slug).join(", ") || "none"}.`,
      );
    return found;
  }

  async function board(ref: string): Promise<Board> {
    const where = boardRef(ref);
    const ws = await place(where.workspace);
    const { data } = await db
      .from("boards")
      .select(boardFields)
      .eq("workspace_id", ws.id)
      .eq("slug", where.board)
      .maybeSingle();
    if (!data) throw new Problem(`There’s no board “${where.board}” in ${ws.slug}. Call list_boards to see the boards.`);
    const row = data as unknown as BoardRow;
    return { ...row, workspace: ws, ref: `${ws.slug}/${row.slug}` };
  }

  const taskId = (b: Board, n: number) => `${b.prefix}-${n}`;
  const taskUrl = (b: Board, n: number) => `${siteUrl}/${b.ref}#${taskId(b, n)}`;
  const boardUrl = (b: Board) => `${siteUrl}/${b.ref}`;

  function numberOf(b: Board, ref: string | number) {
    const text = String(ref).trim();
    const match = text.match(/^(?:#|([A-Za-z][A-Za-z0-9]*)-)?(\d+)$/) ?? text.match(/#([A-Za-z][A-Za-z0-9]*)-(\d+)$/);
    if (!match) throw new Problem(`“${text}” isn’t a task id. Use one like ${b.prefix}-12.`);
    if (match[1] && match[1].toUpperCase() !== b.prefix)
      throw new Problem(`${text} isn’t on ${b.ref}. Its tasks start with ${b.prefix}-.`);
    return Number(match[2]);
  }

  async function row(b: Board, ref: string | number) {
    const n = numberOf(b, ref);
    const { data } = await db
      .from("tasks")
      .select(`${listFields}, description`)
      .eq("board_id", b.id)
      .eq("number", n)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) throw new Problem(`There’s no task ${taskId(b, n)} on ${b.ref}.`);
    return data as unknown as TaskRow;
  }

  async function columnSize(b: Board, status: StatusCategory) {
    const { count } = await db
      .from("tasks")
      .select("number", { count: "exact", head: true })
      .eq("board_id", b.id)
      .eq("status", status)
      .is("deleted_at", null);
    return count ?? 0;
  }

  function pickLabels(b: Board, names: string[]) {
    const known = b.labels ?? [];
    return names.map((name) => {
      const hit = known.find((l) => same(l.id, name));
      if (!hit)
        throw new Problem(
          `${b.ref} has no label “${name}”. Its labels: ${known.map((l) => l.id).join(", ") || "none"}.` +
            (can("manage") ? " Add one with update_board." : ""),
        );
      return hit.id;
    });
  }

  function pickProject(b: Board, name: string | null | undefined) {
    if (name === undefined || name === null || name === "") return name === undefined ? undefined : null;
    const known = b.projects ?? [];
    const hit = known.find((p) => same(p.name, name));
    if (!hit)
      throw new Problem(
        `${b.ref} has no project “${name}”. Its projects: ${known.map((p) => p.name).join(", ") || "none"}.` +
          (can("manage") ? " Add one with update_board." : ""),
      );
    return hit.name;
  }

  async function pickPerson(b: Board, who: string | null | undefined) {
    if (who === undefined || who === null || who === "") return who === undefined ? undefined : null;
    const list = await people(b.workspace_id);
    if (same(who, "me")) return agent.userId;
    const exact = list.filter((p) => p.id === who || same(p.name, who));
    const hits = exact.length ? exact : list.filter((p) => p.name.toLowerCase().startsWith(who.trim().toLowerCase()));
    if (hits.length === 1) return hits[0].id;
    throw new Problem(
      hits.length
        ? `“${who}” could be ${hits.map((p) => p.name).join(" or ")}. Use the full name.`
        : `No one called “${who}” is in ${b.workspace.slug}. People there: ${list.map((p) => p.name).join(", ")}. Use "me" for yourself.`,
    );
  }

  async function apply(b: Board, changes: Record<string, unknown>) {
    const { data, error } = await db.rpc("agent_apply", { p_key: agent.hash, p_board: b.id, p_changes: changes });
    if (error) throw dbProblem(error);
    return data as { moved: Record<string, number>; next: number };
  }

  function summary(b: Board, t: TaskRow, who: (id: string | null) => string | undefined) {
    const done = t.subtasks.filter((s) => s.done).length;
    return compact({
      id: taskId(b, t.number),
      title: t.title,
      status: t.status,
      priority: t.priority === "none" ? undefined : t.priority,
      assignee: who(t.assignee),
      labels: t.labels,
      project: t.project,
      size: t.size,
      start: t.start_on,
      due: t.due_on,
      subtasks: t.subtasks.length ? `${done}/${t.subtasks.length}` : undefined,
      public: t.public || undefined,
      votes: t.vote_count || undefined,
      shipped: t.shipped_on,
    });
  }

  async function detail(b: Board, t: TaskRow) {
    const who = await nameOf(b.workspace_id);
    const [{ data: comments }, { data: activity }] = await Promise.all([
      db
        .from("comments")
        .select("author, body, created_at, via")
        .eq("board_id", b.id)
        .eq("number", t.number)
        .order("created_at"),
      db
        .from("activity")
        .select("actor, text, created_at, via")
        .eq("board_id", b.id)
        .eq("number", t.number)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    return {
      ...summary(b, t, who),
      url: taskUrl(b, t.number),
      description: t.description || undefined,
      subtasks: t.subtasks.length ? t.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done })) : undefined,
      comments: (comments ?? []).length
        ? (comments ?? []).map((c) => compact({ by: who(c.author), via: c.via, at: c.created_at, body: c.body }))
        : undefined,
      activity: (activity ?? [])
        .reverse()
        .map((a) => compact({ by: who(a.actor), via: a.via, at: a.created_at, text: a.text })),
      created: t.created_at,
      updated: t.updated_at,
    };
  }

  return {
    agent,
    can,

    async overview() {
      const list = await workspaces();
      const [{ data: me }, { data: boards }] = await Promise.all([
        db.from("profiles").select("name").eq("id", agent.userId).maybeSingle(),
        list.length
          ? db
              .from("boards")
              .select("id, workspace_id, slug, name, prefix, roadmap_public")
              .in(
                "workspace_id",
                list.map((w) => w.id),
              )
              .order("position")
              .order("created_at")
          : Promise.resolve({ data: [] as never[] }),
      ]);
      const open = await Promise.all(
        (boards ?? []).map(async (b) => {
          const { count } = await db
            .from("tasks")
            .select("number", { count: "exact", head: true })
            .eq("board_id", b.id)
            .in("status", openStatuses)
            .is("deleted_at", null);
          return [b.id, count ?? 0] as const;
        }),
      );
      const counts = new Map(open);
      return {
        you: me?.name ?? undefined,
        key: { name: agent.name, access: agent.access, limited_to_some_workspaces: agent.workspaces ? true : undefined },
        workspaces: list.map((w) => ({
          workspace: w.slug,
          name: w.name,
          your_role: w.role,
          boards: (boards ?? [])
            .filter((b) => b.workspace_id === w.id)
            .map((b) =>
              compact({
                board: `${w.slug}/${b.slug}`,
                name: b.name,
                task_prefix: b.prefix,
                open_tasks: counts.get(b.id) ?? 0,
                public_roadmap: b.roadmap_public || undefined,
              }),
            ),
        })),
      };
    },

    async board(ref: string) {
      const b = await board(ref);
      const [list, counts, { count: suggestions }] = await Promise.all([
        people(b.workspace_id),
        Promise.all(taskStatuses.map(async (s) => [s, await columnSize(b, s)] as const)),
        db.from("suggestions").select("id", { count: "exact", head: true }).eq("board_id", b.id),
      ]);
      const page = pageFrom(b.name, b.slug, b.page);
      return compact({
        board: b.ref,
        name: b.name,
        workspace: b.workspace.name,
        url: boardUrl(b),
        task_prefix: b.prefix,
        tasks_by_status: Object.fromEntries(counts),
        labels: (b.labels ?? []).map((l) => l.id),
        projects: (b.projects ?? []).map((p) => p.name),
        people: list.map((p) => compact({ name: p.name, role: p.role, you: p.id === agent.userId || undefined })),
        roadmap: compact({
          public: b.roadmap_public,
          url: b.roadmap_public ? new URL(publicHref(b.workspace.slug, b.slug), siteUrl).href : undefined,
          title: page.title,
          tagline: page.tagline,
          voting: page.voting,
          ideas: page.ideas,
          suggestions_waiting: suggestions ?? 0,
        }),
      });
    },

    async tasks(ref: string, f: Filters) {
      const b = await board(ref);
      const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
      let q = db
        .from("tasks")
        .select(listFields, { count: "exact" })
        .eq("board_id", b.id)
        .is("deleted_at", null)
        .in("status", f.status?.length ? f.status : openStatuses);
      if (f.assignee !== undefined) {
        const id = await pickPerson(b, f.assignee);
        q = id ? q.eq("assignee", id) : q.is("assignee", null);
      }
      if (f.label) q = q.contains("labels", pickLabels(b, [f.label]));
      if (f.project) q = q.eq("project", pickProject(b, f.project)!);
      const text = f.query?.trim().replace(/["\\]/g, "");
      if (text) {
        const n = text.match(/^(?:[A-Za-z][A-Za-z0-9]*-)?(\d+)$/)?.[1];
        q = q.or(
          `title.ilike."%${text}%",description.ilike."%${text}%"${n ? `,number.eq.${n}` : ""}`,
        );
      }
      const { data, count, error } = await q.order("position").order("number").limit(limit);
      if (error) throw dbProblem(error);
      const who = await nameOf(b.workspace_id);
      const rows = ((data ?? []) as unknown as TaskRow[]).sort(
        (a, c) => statusRank[a.status] - statusRank[c.status],
      );
      return {
        board: b.ref,
        tasks: rows.map((t) => summary(b, t, who)),
        shown: rows.length,
        total: count ?? rows.length,
      };
    },

    async task(ref: string, task: string) {
      const b = await board(ref);
      return detail(b, await row(b, task));
    },

    async createTasks(ref: string, list: (TaskInput & { subtasks?: string[] })[]) {
      const b = await board(ref);
      const sizes = new Map<StatusCategory, number>();
      const created: Record<string, unknown>[] = [];
      const activity: Record<string, unknown>[] = [];
      for (const [i, t] of list.entries()) {
        const title = t.title?.trim();
        if (!title) throw new Problem(`Task ${i + 1} needs a title.`);
        const status = t.status ?? "todo";
        if (!sizes.has(status)) sizes.set(status, await columnSize(b, status));
        const position = sizes.get(status)!;
        sizes.set(status, position + 1);
        const number = b.next_number + i;
        created.push({
          number,
          title,
          status,
          priority: t.priority ?? "none",
          size: t.size ?? null,
          project: pickProject(b, t.project) ?? null,
          labels: pickLabels(b, t.labels ?? []),
          start_on: day(t.start, "start") ?? null,
          due_on: day(t.due, "due") ?? null,
          assignee: (await pickPerson(b, t.assignee)) ?? null,
          description: t.description ?? "",
          subtasks: (t.subtasks ?? []).map((s) => ({ id: `s${randomUUID().slice(0, 8)}`, title: s, done: false })),
          public: t.public ?? false,
          shipped_on: status === "done" ? today() : null,
          position,
        });
        activity.push({ id: randomUUID(), number, text: "created the task" });
      }
      const { moved } = await apply(b, { created, activity });
      const numbers = created.map((c) => moved[String(c.number)] ?? (c.number as number));
      return {
        board: b.ref,
        created: numbers.map((n, i) => ({ id: taskId(b, n), title: created[i].title, url: taskUrl(b, n) })),
      };
    },

    async updateTask(ref: string, task: string, p: TaskPatch) {
      const b = await board(ref);
      const t = await row(b, task);
      const fields: Record<string, unknown> = {};
      const notes: string[] = [];
      const who = await nameOf(b.workspace_id);

      if (p.title !== undefined && p.title.trim() && p.title.trim() !== t.title) {
        fields.title = p.title.trim();
        notes.push("renamed the task");
      }
      if (p.description !== undefined && p.description !== t.description) {
        fields.description = p.description;
        notes.push("edited the description");
      }
      let order: { number: number; position: number }[] = [];
      if (p.status && p.status !== t.status) {
        fields.status = p.status;
        if (p.status === "done") fields.shipped_on = today();
        else if (t.status === "done") fields.shipped_on = null;
        notes.push(`moved it to ${statusTitle[p.status]}`);
        order = [{ number: t.number, position: await columnSize(b, p.status) }];
      }
      if (p.priority && p.priority !== t.priority) {
        fields.priority = p.priority;
        notes.push(`set priority to ${priorities.find((x) => x.id === p.priority)?.title}`);
      }
      if (p.size !== undefined && (p.size ?? null) !== t.size) {
        fields.size = p.size ?? null;
        notes.push(p.size ? `sized it ${p.size.toUpperCase()}` : "removed the size");
      }
      const project = pickProject(b, p.project);
      if (project !== undefined && project !== t.project) {
        fields.project = project;
        notes.push(project ? `moved it to project ${project}` : "removed the project");
      }
      const assignee = await pickPerson(b, p.assignee);
      if (assignee !== undefined && assignee !== t.assignee) {
        fields.assignee = assignee;
        notes.push(assignee ? `assigned ${who(assignee)}` : "removed the assignee");
      }
      for (const [field, column, word] of [
        ["start", "start_on", "start date"],
        ["due", "due_on", "due date"],
      ] as const) {
        const value = day(p[field], field);
        if (value !== undefined && value !== t[column]) {
          fields[column] = value;
          notes.push(value ? `set the ${word} to ${formatDue(value)}` : `removed the ${word}`);
        }
      }
      if (p.public !== undefined && p.public !== t.public) {
        fields.public = p.public;
        notes.push(p.public ? "added it to the public roadmap" : "took it off the public roadmap");
      }

      let labels = p.labels ? pickLabels(b, p.labels) : [...t.labels];
      for (const l of pickLabels(b, p.add_labels ?? [])) if (!labels.includes(l)) labels.push(l);
      const drop = new Set(pickLabels(b, p.remove_labels ?? []));
      labels = labels.filter((l) => !drop.has(l));
      if (labels.join("\u0000") !== t.labels.join("\u0000")) {
        fields.labels = labels;
        for (const l of labels) if (!t.labels.includes(l)) notes.push(`added label ${l}`);
        for (const l of t.labels) if (!labels.includes(l)) notes.push(`removed label ${l}`);
      }

      const subtasks = t.subtasks.map((s) => ({ ...s }));
      const find = (ref: string) => {
        const hit = subtasks.find((s) => s.id === ref || same(s.title, ref));
        if (!hit)
          throw new Problem(
            `${taskId(b, t.number)} has no subtask “${ref}”. Its subtasks: ${subtasks.map((s) => `“${s.title}”`).join(", ") || "none"}.`,
          );
        return hit;
      };
      for (const ref of p.complete_subtasks ?? []) {
        const s = find(ref);
        if (!s.done) notes.push(`completed “${s.title}”`);
        s.done = true;
      }
      for (const ref of p.reopen_subtasks ?? []) {
        const s = find(ref);
        if (s.done) notes.push(`reopened “${s.title}”`);
        s.done = false;
      }
      for (const title of p.add_subtasks ?? []) {
        if (!title.trim()) continue;
        subtasks.push({ id: `s${randomUUID().slice(0, 8)}`, title: title.trim(), done: false });
        notes.push(`added subtask “${title.trim()}”`);
      }
      if (JSON.stringify(subtasks) !== JSON.stringify(t.subtasks)) fields.subtasks = subtasks;

      if (!Object.keys(fields).length) return { unchanged: true, task: summary(b, t, who) };
      await apply(b, {
        updated: [{ number: t.number, fields }],
        order,
        activity: notes.map((text) => ({ id: randomUUID(), number: t.number, text })),
      });
      return { changed: notes, task: summary(b, await row(b, t.number), who) };
    },

    async comment(ref: string, task: string, body: string) {
      const b = await board(ref);
      const t = await row(b, task);
      if (!body.trim()) throw new Problem("A comment can’t be empty.");
      await apply(b, {
        comments: [{ id: randomUUID(), number: t.number, body: body.trim() }],
        activity: [{ id: randomUUID(), number: t.number, text: "commented" }],
      });
      return { commented: taskId(b, t.number), url: taskUrl(b, t.number) };
    },

    async deleteTask(ref: string, task: string) {
      const b = await board(ref);
      const t = await row(b, task);
      await apply(b, { deleted: [t.number] });
      return { deleted: taskId(b, t.number), title: t.title };
    },

    async suggestions(ref: string) {
      const b = await board(ref);
      const { data } = await db
        .from("suggestions")
        .select("id, title, details, by_name, vote_count, created_at")
        .eq("board_id", b.id)
        .order("vote_count", { ascending: false })
        .order("created_at")
        .limit(100);
      return {
        board: b.ref,
        suggestions: (data ?? []).map((s) =>
          compact({ id: s.id, title: s.title, details: s.details, by: s.by_name, votes: s.vote_count, at: s.created_at }),
        ),
      };
    },

    async reviewSuggestion(ref: string, id: string, accept: boolean) {
      const b = await board(ref);
      const { data: s } = await db
        .from("suggestions")
        .select("id, title, details, by_name")
        .eq("board_id", b.id)
        .eq("id", id)
        .maybeSingle();
      if (!s) throw new Problem(`There’s no suggestion ${id} on ${b.ref}. Call list_suggestions for the ids.`);
      if (!accept) {
        await apply(b, { declined: [s.id] });
        return { declined: s.title };
      }
      const number = b.next_number;
      const feature = (b.labels ?? []).find((l) => l.id === "Feature");
      const { moved } = await apply(b, {
        created: [
          {
            number,
            title: s.title.slice(0, 500),
            status: "todo",
            labels: feature ? [feature.id] : [],
            description: s.details ?? "",
            public: true,
            position: await columnSize(b, "todo"),
            origin: s.id,
          },
        ],
        activity: [{ id: randomUUID(), number, text: `accepted a suggestion from ${s.by_name}` }],
        declined: [s.id],
      });
      const n = moved[String(number)] ?? number;
      return { accepted: s.title, task: taskId(b, n), url: taskUrl(b, n) };
    },

    async createBoard(workspace: string, name: string) {
      const ws = await place(workspace);
      const clean = name.trim().slice(0, 60);
      if (!clean) throw new Problem("A board needs a name.");
      let base = slugify(clean).replace(/-+$/, "");
      if (boardSlugProblem(base)) base = `${base || "board"}-board`.slice(0, 28).replace(/-+$/, "");
      const { data: taken } = await db.from("boards").select("slug").eq("workspace_id", ws.id);
      const used = new Set((taken ?? []).map((x) => x.slug));
      let slug = base;
      for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
      const { data, error } = await db.rpc("agent_board", {
        p_key: agent.hash,
        p_workspace: ws.id,
        p_board: null,
        p_fields: { name: clean, slug },
      });
      if (error) throw dbProblem(error);
      const made = data as { slug: string; name: string; prefix: string };
      return { board: `${ws.slug}/${made.slug}`, name: made.name, task_prefix: made.prefix, url: `${siteUrl}/${ws.slug}/${made.slug}` };
    },

    async updateBoard(
      ref: string,
      p: {
        name?: string;
        add_labels?: { name: string; tone?: Tone }[];
        remove_labels?: string[];
        add_projects?: { name: string; tone?: Tone | "ink" }[];
        remove_projects?: string[];
      },
    ) {
      const b = await board(ref);
      const fields: Record<string, unknown> = {};
      if (p.name?.trim() && p.name.trim() !== b.name) fields.name = p.name.trim().slice(0, 60);

      const labels = [...(b.labels ?? [])];
      for (const l of p.add_labels ?? []) {
        const id = l.name.trim().slice(0, 40);
        if (id && !labels.some((x) => same(x.id, id))) labels.push({ id, tone: l.tone ?? tones[labels.length % 4] });
      }
      const goneLabels = (p.remove_labels ?? []).map((n) => pickLabels(b, [n])[0]);
      const nextLabels = labels.filter((l) => !goneLabels.includes(l.id)).slice(0, 30);
      if (JSON.stringify(nextLabels) !== JSON.stringify(b.labels ?? [])) fields.labels = nextLabels;

      const projects = [...(b.projects ?? [])];
      for (const pr of p.add_projects ?? []) {
        const name = pr.name.trim().slice(0, 40);
        if (name && !projects.some((x) => same(x.name, name)))
          projects.push({ name, tone: pr.tone ?? tones[projects.length % 4] });
      }
      const goneProjects = (p.remove_projects ?? []).map((n) => pickProject(b, n));
      const nextProjects = projects.filter((x) => !goneProjects.includes(x.name)).slice(0, 30);
      if (JSON.stringify(nextProjects) !== JSON.stringify(b.projects ?? [])) fields.projects = nextProjects;

      if (Object.keys(fields).length) {
        const { error } = await db.rpc("agent_board", {
          p_key: agent.hash,
          p_workspace: b.workspace_id,
          p_board: b.id,
          p_fields: fields,
        });
        if (error) throw dbProblem(error);
      }
      return {
        board: b.ref,
        name: (fields.name as string) ?? b.name,
        labels: nextLabels.map((l) => l.id),
        projects: nextProjects.map((x) => x.name),
      };
    },

    async updateRoadmap(
      ref: string,
      p: { public?: boolean; title?: string; tagline?: string; voting?: boolean; ideas?: boolean },
    ) {
      const b = await board(ref);
      const change: Record<string, unknown> = {};
      if (p.public !== undefined && p.public !== b.roadmap_public) change.roadmap_public = p.public;
      const patch = compact({ title: p.title?.trim().slice(0, 80), tagline: p.tagline?.trim().slice(0, 400) });
      if (p.voting !== undefined) Object.assign(patch, { voting: p.voting });
      if (p.ideas !== undefined) Object.assign(patch, { ideas: p.ideas, ideasPublic: p.ideas });
      if (Object.keys(patch).length) change.page = { ...b.page, ...patch };
      if (Object.keys(change).length) await apply(b, { board: change });
      const live = (change.roadmap_public as boolean | undefined) ?? b.roadmap_public;
      return compact({
        board: b.ref,
        public: live,
        url: live ? new URL(publicHref(b.workspace.slug, b.slug), siteUrl).href : undefined,
        ...pageSummary(pageFrom(b.name, b.slug, (change.page as object) ?? b.page)),
      });
    },
  };
}

const pageSummary = (page: ReturnType<typeof pageFrom>) => ({
  title: page.title,
  tagline: page.tagline,
  voting: page.voting,
  ideas: page.ideas,
});

export type Acta = ReturnType<typeof actaFor>;
