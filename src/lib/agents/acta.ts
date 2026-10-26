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
export const taskStatuses = ["todo", "in_progress", "review", "done", "canceled"] as const;
export const sortKeys = ["priority", "due", "start", "created", "updated", "size", "title", "votes"] as const;
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
  deleted_at: string | null;
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

// A comment, possibly brought over from elsewhere with who wrote it there and when
export type CommentInput = { body: string; author?: string; at?: string };

export type NewTask = TaskInput & {
  subtasks?: string[];
  created?: string;
  shipped?: string;
  comments?: CommentInput[];
};

export type TaskPatch = TaskInput & {
  shipped?: string | null;
  add_labels?: string[];
  remove_labels?: string[];
  add_subtasks?: string[];
  complete_subtasks?: string[];
  reopen_subtasks?: string[];
  rename_subtasks?: { subtask: string; title: string }[];
  remove_subtasks?: string[];
  place?: "top" | "bottom";
  before?: string;
  after?: string;
};

export type Filters = {
  status?: StatusCategory[];
  assignee?: string;
  label?: string;
  project?: string;
  query?: string;
  deleted?: boolean;
  limit?: number;
};

// Enough of a board to name its tasks
type Spot = { prefix: string; ref: string };

const boardFields = "id, workspace_id, slug, name, prefix, next_number, labels, projects, roadmap_public, page";
const listFields =
  "number, title, status, priority, size, project, labels, start_on, due_on, assignee, subtasks, public, shipped_on, vote_count, created_at, updated_at, deleted_at";

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

// A date or a time that has passed, for work brought over from elsewhere. A bare date counts as midday UTC,
// so it lands on the same day almost everywhere
function moment(value: string | undefined, field: string) {
  if (!value?.trim()) return undefined;
  const text = value.trim();
  const bare = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const at = Date.parse(bare ? `${text}T12:00:00Z` : text);
  if (Number.isNaN(at)) throw new Problem(`${field} must be a date like 2026-11-02 or a time like 2026-11-02T14:30:00Z.`);
  if (!bare && at > Date.now() + 60_000) throw new Problem(`${field} can’t be in the future.`);
  return new Date(Math.min(at, Date.now())).toISOString();
}

const priorityRank: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
const sizeRank: Record<Size, number> = { xs: 0, s: 1, m: 2, l: 3, xl: 4 };

// What each sort compares, in its natural order. Tasks without a value go last
const sortValue: Record<(typeof sortKeys)[number], (t: TaskRow) => string | number | null> = {
  priority: (t) => (t.priority === "none" ? null : priorityRank[t.priority]),
  due: (t) => t.due_on,
  start: (t) => t.start_on,
  created: (t) => Date.parse(t.created_at),
  updated: (t) => -Date.parse(t.updated_at),
  size: (t) => (t.size ? sizeRank[t.size] : null),
  title: (t) => t.title.toLowerCase(),
  votes: (t) => -t.vote_count,
};

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

// Matches words in titles and descriptions, or a task id like ACT-12 or 12
function search<Q extends { or: (filter: string) => Q }>(q: Q, text: string | undefined, prefixes?: string[]) {
  const words = text?.trim().replace(/["\\]/g, "");
  if (!words) return q;
  const id = words.match(/^(?:([A-Za-z][A-Za-z0-9]*)-)?(\d+)$/);
  const byNumber = id && (!prefixes || !id[1] || prefixes.includes(id[1].toUpperCase())) ? `,number.eq.${id[2]}` : "";
  return q.or(`title.ilike."%${words}%",description.ilike."%${words}%"${byNumber}`);
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

  const taskId = (b: Spot, n: number) => `${b.prefix}-${n}`;
  const taskUrl = (b: Spot, n: number) => `${siteUrl}/${b.ref}#${taskId(b, n)}`;
  const boardUrl = (b: Board) => `${siteUrl}/${b.ref}`;

  function numberOf(b: Board, ref: string | number) {
    const text = String(ref).trim();
    const match = text.match(/^(?:#|([A-Za-z][A-Za-z0-9]*)-)?(\d+)$/) ?? text.match(/#([A-Za-z][A-Za-z0-9]*)-(\d+)$/);
    if (!match) throw new Problem(`“${text}” isn’t a task id. Use one like ${b.prefix}-12.`);
    if (match[1] && match[1].toUpperCase() !== b.prefix)
      throw new Problem(`${text} isn’t on ${b.ref}. Its tasks start with ${b.prefix}-.`);
    return Number(match[2]);
  }

  async function row(b: Board, ref: string | number, deleted = false) {
    const n = numberOf(b, ref);
    const { data } = await db
      .from("tasks")
      .select(`${listFields}, description, origin`)
      .eq("board_id", b.id)
      .eq("number", n)
      .maybeSingle();
    const t = data as unknown as (TaskRow & { origin: string | null }) | null;
    if (!t) throw new Problem(`There’s no task ${taskId(b, n)} on ${b.ref}.`);
    if (deleted && !t.deleted_at) throw new Problem(`${taskId(b, n)} isn’t deleted.`);
    if (!deleted && t.deleted_at)
      throw new Problem(`${taskId(b, n)} was deleted.${can("write") ? " restore_task brings it back." : ""}`);
    return t;
  }

  // The column's tasks top to bottom, leaving one out
  async function columnOrder(b: Board, status: StatusCategory, without: number) {
    const { data } = await db
      .from("tasks")
      .select("number")
      .eq("board_id", b.id)
      .eq("status", status)
      .is("deleted_at", null)
      .neq("number", without)
      .order("position")
      .order("number");
    return (data ?? []).map((r) => r.number as number);
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

  function commentRow(number: number, c: CommentInput) {
    const body = c.body?.trim();
    if (!body) throw new Problem("A comment can’t be empty.");
    return {
      id: randomUUID(),
      number,
      body,
      author_name: c.author?.trim().slice(0, 60) || undefined,
      created_at: moment(c.at, "at"),
    };
  }

  async function apply(b: Board, changes: Record<string, unknown>) {
    const { data, error } = await db.rpc("agent_apply", { p_key: agent.hash, p_board: b.id, p_changes: changes });
    if (error) throw dbProblem(error);
    return data as { moved: Record<string, number>; next: number };
  }

  function summary(b: Spot, t: TaskRow, who: (id: string | null) => string | undefined) {
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
      deleted: t.deleted_at,
    });
  }

  async function detail(b: Board, t: TaskRow) {
    const who = await nameOf(b.workspace_id);
    const [{ data: comments }, { data: activity }] = await Promise.all([
      db
        .from("comments")
        .select("*")
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
        ? (comments ?? []).map((c) =>
            compact({
              id: c.id,
              by: c.author_name ?? who(c.author),
              added_by: c.author_name ? who(c.author) : undefined,
              via: c.via,
              at: c.created_at,
              body: c.body,
              yours: c.agent_key === agent.keyId || undefined,
            }),
          )
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
          new_tasks_public: page.newTasksPublic,
          suggestions_waiting: suggestions ?? 0,
        }),
      });
    },

    async tasks(ref: string, f: Filters) {
      const b = await board(ref);
      const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
      let q = db.from("tasks").select(listFields, { count: "exact" }).eq("board_id", b.id);
      if (f.deleted) {
        q = q.not("deleted_at", "is", null);
        if (f.status?.length) q = q.in("status", f.status);
      } else q = q.is("deleted_at", null).in("status", f.status?.length ? f.status : openStatuses);
      if (f.assignee !== undefined) {
        const id = await pickPerson(b, f.assignee);
        q = id ? q.eq("assignee", id) : q.is("assignee", null);
      }
      if (f.label) q = q.contains("labels", pickLabels(b, [f.label]));
      if (f.project) q = q.eq("project", pickProject(b, f.project)!);
      q = search(q, f.query);
      const { data, count, error } = await (f.deleted
        ? q.order("deleted_at", { ascending: false })
        : q.order("position").order("number")
      ).limit(limit);
      if (error) throw dbProblem(error);
      const who = await nameOf(b.workspace_id);
      const rows = (data ?? []) as unknown as TaskRow[];
      if (!f.deleted) rows.sort((a, c) => statusRank[a.status] - statusRank[c.status]);
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

    async createTasks(ref: string, list: NewTask[]) {
      const b = await board(ref);
      const sizes = new Map<StatusCategory, number>();
      const created: Record<string, unknown>[] = [];
      const newPublic = pageFrom(b.name, b.slug, b.page).newTasksPublic;
      const activity: Record<string, unknown>[] = [];
      const comments: Record<string, unknown>[] = [];
      for (const [i, t] of list.entries()) {
        const title = t.title?.trim();
        if (!title) throw new Problem(`Task ${i + 1} needs a title.`);
        const status = t.status ?? "todo";
        if (t.shipped && status !== "done")
          throw new Problem(`Task ${i + 1} has a shipped date, so its status should be done.`);
        const at = moment(t.created, "created");
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
          public: t.public ?? newPublic,
          shipped_on: status === "done" ? (day(t.shipped, "shipped") ?? today()) : null,
          position,
          created_at: at,
        });
        activity.push({ id: randomUUID(), number, text: "created the task", created_at: at });
        for (const c of t.comments ?? []) comments.push(commentRow(number, c));
      }
      const { moved } = await apply(b, { created, comments, activity });
      const numbers = created.map((c) => moved[String(c.number)] ?? (c.number as number));
      return {
        board: b.ref,
        created: numbers.map((n, i) =>
          compact({ id: taskId(b, n), title: created[i].title, url: taskUrl(b, n), public: created[i].public || undefined }),
        ),
        public_by_default: newPublic,
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
      const shipped = day(p.shipped, "shipped");
      if (shipped !== undefined) {
        if (shipped && ((fields.status as StatusCategory | undefined) ?? t.status) !== "done")
          throw new Problem("Only done tasks have a shipped date. Set status to done as well.");
        if (shipped !== ("shipped_on" in fields ? fields.shipped_on : t.shipped_on)) {
          fields.shipped_on = shipped;
          notes.push(shipped ? `set the shipped date to ${formatDue(shipped)}` : "removed the shipped date");
        }
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
      for (const r of p.rename_subtasks ?? []) {
        const s = find(r.subtask);
        const title = r.title.trim().slice(0, 200);
        if (!title || title === s.title) continue;
        notes.push(`renamed subtask “${s.title}” to “${title}”`);
        s.title = title;
      }
      for (const ref of p.remove_subtasks ?? []) {
        const s = find(ref);
        subtasks.splice(subtasks.indexOf(s), 1);
        notes.push(`removed subtask “${s.title}”`);
      }
      for (const title of p.add_subtasks ?? []) {
        if (!title.trim()) continue;
        subtasks.push({ id: `s${randomUUID().slice(0, 8)}`, title: title.trim(), done: false });
        notes.push(`added subtask “${title.trim()}”`);
      }
      if (JSON.stringify(subtasks) !== JSON.stringify(t.subtasks)) fields.subtasks = subtasks;

      const places = [p.place, p.before, p.after].filter(Boolean).length;
      if (places > 1) throw new Problem("Use only one of place, before and after.");
      if (places) {
        const status = (fields.status as StatusCategory | undefined) ?? t.status;
        const column = await columnOrder(b, status, t.number);
        let at = p.place === "top" ? 0 : column.length;
        const next = p.before ?? p.after;
        if (next) {
          const other = numberOf(b, next);
          const i = column.indexOf(other);
          if (i === -1)
            throw new Problem(
              `${taskId(b, other)} isn’t in ${statusTitle[status]}. Place a task next to one in its own column.`,
            );
          at = p.before ? i : i + 1;
        }
        column.splice(at, 0, t.number);
        order = column.map((number, position) => ({ number, position }));
      }

      if (!Object.keys(fields).length && !places) return { unchanged: true, task: summary(b, t, who) };
      await apply(b, {
        updated: Object.keys(fields).length ? [{ number: t.number, fields }] : [],
        order,
        activity: notes.map((text) => ({ id: randomUUID(), number: t.number, text })),
      });
      const placed = order.length > 1 ? order.findIndex((o) => o.number === t.number) + 1 : undefined;
      return compact({
        changed: notes,
        place_in_column: placed && `${placed} of ${order.length}`,
        task: summary(b, await row(b, t.number), who),
      });
    },

    async comment(ref: string, task: string, c: CommentInput) {
      const b = await board(ref);
      const t = await row(b, task);
      const made = commentRow(t.number, c);
      await apply(b, {
        comments: [made],
        activity: [{ id: randomUUID(), number: t.number, text: "commented", created_at: made.created_at }],
      });
      return { comment: made.id, task: taskId(b, t.number), url: taskUrl(b, t.number) };
    },

    // Changes several tasks one after another. A task that can't change is reported and the rest carry on
    async updateTasks(ref: string, list: (TaskPatch & { task: string })[]) {
      const updated: Record<string, unknown>[] = [];
      const failed: { task: string; problem: string }[] = [];
      for (const { task, ...patch } of list) {
        try {
          updated.push({ id: task, ...(await this.updateTask(ref, task, patch)) });
        } catch (error) {
          if (!(error instanceof Problem)) throw error;
          failed.push({ task, problem: error.message });
        }
      }
      return compact({ board: ref, updated, failed });
    },

    // Sorts a column by a field, or puts the given tasks at its top in that order
    async sortColumn(
      ref: string,
      p: { status: StatusCategory; by?: (typeof sortKeys)[number]; reverse?: boolean; tasks?: string[] },
    ) {
      const b = await board(ref);
      if (!p.by === !p.tasks?.length) throw new Problem("Pass by, to sort the column, or tasks, to set its order.");
      const { data, error } = await db
        .from("tasks")
        .select(listFields)
        .eq("board_id", b.id)
        .eq("status", p.status)
        .is("deleted_at", null)
        .order("position")
        .order("number");
      if (error) throw dbProblem(error);
      const rows = (data ?? []) as unknown as TaskRow[];
      let sorted: TaskRow[];
      if (p.by) {
        const value = sortValue[p.by];
        const flip = p.reverse ? -1 : 1;
        sorted = [...rows].sort((x, y) => {
          const a = value(x);
          const c = value(y);
          if (a === null || c === null) return a === c ? 0 : a === null ? 1 : -1;
          return (typeof a === "string" ? a.localeCompare(String(c)) : a - Number(c)) * flip;
        });
      } else {
        const first = [...new Set((p.tasks ?? []).map((r) => numberOf(b, r)))];
        const missing = first.filter((n) => !rows.some((r) => r.number === n));
        if (missing.length)
          throw new Problem(
            `${missing.map((n) => taskId(b, n)).join(", ")} ${missing.length === 1 ? "isn’t" : "aren’t"} in ${statusTitle[p.status]}.`,
          );
        sorted = [...first.map((n) => rows.find((r) => r.number === n)!), ...rows.filter((r) => !first.includes(r.number))];
      }
      // Positions are rewritten whole, so a column left uneven by earlier moves comes out tidy too
      await apply(b, { order: sorted.map((r, position) => ({ number: r.number, position })) });
      return {
        board: b.ref,
        status: p.status,
        order: sorted.map((r) => `${taskId(b, r.number)} ${r.title}`),
      };
    },

    async activity(ref: string, f: { since?: string; limit?: number }) {
      const b = await board(ref);
      const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
      let q = db.from("activity").select("number, actor, text, created_at, via").eq("board_id", b.id);
      const since = moment(f.since, "since");
      if (since) q = q.gt("created_at", since);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
      if (error) throw dbProblem(error);
      const numbers = [...new Set((data ?? []).map((a) => a.number as number))];
      const [who, { data: titles }] = await Promise.all([
        nameOf(b.workspace_id),
        numbers.length
          ? db.from("tasks").select("number, title").eq("board_id", b.id).in("number", numbers)
          : Promise.resolve({ data: [] as { number: number; title: string }[] }),
      ]);
      const titleOf = new Map((titles ?? []).map((t) => [t.number as number, t.title as string]));
      return {
        board: b.ref,
        activity: (data ?? []).map((a) =>
          compact({
            task: taskId(b, a.number),
            title: titleOf.get(a.number),
            by: who(a.actor),
            via: a.via,
            at: a.created_at,
            text: a.text,
          }),
        ),
      };
    },

    async editComment(ref: string, id: string, body: string) {
      const b = await board(ref);
      if (!body.trim()) throw new Problem("A comment can’t be empty.");
      const { data: c } = await db
        .from("comments")
        .select("id, number, agent_key")
        .eq("board_id", b.id)
        .eq("id", id)
        .maybeSingle();
      if (!c) throw new Problem(`There’s no comment ${id} on ${b.ref}. get_task lists a task’s comments with their ids.`);
      if (c.agent_key !== agent.keyId)
        throw new Problem("This key can only edit comments it wrote. Add a new comment instead.");
      const { error } = await db.rpc("agent_edit_comment", { p_key: agent.hash, p_comment: id, p_body: body.trim() });
      if (error) throw dbProblem(error);
      return { edited: id, task: taskId(b, c.number), url: taskUrl(b, c.number) };
    },

    async restoreTask(ref: string, task: string) {
      const b = await board(ref);
      const t = await row(b, task, true);
      // Creating a task with a deleted task's number brings that task back
      await apply(b, {
        created: [
          {
            number: t.number,
            title: t.title,
            status: t.status,
            priority: t.priority,
            size: t.size,
            project: t.project,
            labels: t.labels,
            start_on: t.start_on,
            due_on: t.due_on,
            assignee: t.assignee,
            description: t.description,
            subtasks: t.subtasks,
            public: t.public,
            shipped_on: t.shipped_on,
            position: await columnSize(b, t.status),
            origin: t.origin,
          },
        ],
        activity: [{ id: randomUUID(), number: t.number, text: "restored the task" }],
      });
      return { restored: taskId(b, t.number), title: t.title, status: t.status, url: taskUrl(b, t.number) };
    },

    async searchAll(f: Omit<Filters, "label" | "project" | "deleted">) {
      const list = await workspaces();
      const { data: boards } = list.length
        ? await db
            .from("boards")
            .select("id, workspace_id, slug, prefix")
            .in(
              "workspace_id",
              list.map((w) => w.id),
            )
        : { data: [] };
      const spots = new Map<string, Spot>(
        (boards ?? []).map((x) => [
          x.id as string,
          { prefix: x.prefix as string, ref: `${list.find((w) => w.id === x.workspace_id)?.slug}/${x.slug}` },
        ]),
      );
      if (!spots.size) return { tasks: [], shown: 0, total: 0 };

      const everyone = (await Promise.all(list.map((w) => people(w.id)))).flat();
      const names = new Map(everyone.map((p) => [p.id, p.name]));
      let assignee: string | null | undefined;
      if (f.assignee !== undefined) {
        const who = f.assignee.trim();
        if (!who) assignee = null;
        else if (same(who, "me")) assignee = agent.userId;
        else {
          const exact = everyone.filter((p) => p.id === who || same(p.name, who));
          const hits = exact.length ? exact : everyone.filter((p) => p.name.toLowerCase().startsWith(who.toLowerCase()));
          const ids = [...new Set(hits.map((p) => p.id))];
          if (ids.length !== 1)
            throw new Problem(
              ids.length
                ? `“${who}” could be ${[...new Set(hits.map((p) => p.name))].join(" or ")}. Use the full name.`
                : `No one called “${who}” is in these workspaces. Use "me" for yourself.`,
            );
          assignee = ids[0];
        }
      }

      // A task id like ACT-12 only looks on boards with that prefix
      const prefix = f.query?.trim().match(/^([A-Za-z][A-Za-z0-9]*)-\d+$/)?.[1].toUpperCase();
      const ids = [...spots].filter(([, s]) => !prefix || s.prefix === prefix).map(([id]) => id);
      if (!ids.length) return { tasks: [], shown: 0, total: 0 };
      const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
      let q = db
        .from("tasks")
        .select(`board_id, ${listFields}`, { count: "exact" })
        .in("board_id", ids)
        .is("deleted_at", null)
        .in("status", f.status?.length ? f.status : openStatuses);
      if (assignee !== undefined) q = assignee ? q.eq("assignee", assignee) : q.is("assignee", null);
      q = search(q, f.query, prefix ? [prefix] : undefined);
      const { data, count, error } = await q.order("updated_at", { ascending: false }).limit(limit);
      if (error) throw dbProblem(error);
      const who = (uid: string | null) => (uid ? (names.get(uid) ?? "Former member") : undefined);
      const rows = (data ?? []) as unknown as (TaskRow & { board_id: string })[];
      return {
        tasks: rows.map((t) => {
          const spot = spots.get(t.board_id)!;
          return { board: spot.ref, ...summary(spot, t, who), url: taskUrl(spot, t.number) };
        }),
        shown: rows.length,
        total: count ?? rows.length,
      };
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
        update_labels?: { label: string; name?: string; tone?: Tone }[];
        remove_labels?: string[];
        add_projects?: { name: string; tone?: Tone | "ink" }[];
        update_projects?: { project: string; name?: string; tone?: Tone | "ink" }[];
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
      // Renaming a label renames it on every task that has it
      const relabel = new Map<string, string>();
      for (const u of p.update_labels ?? []) {
        const id = pickLabels(b, [u.label])[0];
        const i = labels.findIndex((l) => l.id === id);
        const name = u.name?.trim().slice(0, 40) || id;
        if (name !== id && labels.some((l, j) => j !== i && same(l.id, name)))
          throw new Problem(`${b.ref} already has a label “${name}”.`);
        if (name !== id) relabel.set(id, name);
        labels[i] = { id: name, tone: u.tone ?? labels[i].tone };
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
      const reproject = new Map<string, string>();
      for (const u of p.update_projects ?? []) {
        const was = pickProject(b, u.project)!;
        const i = projects.findIndex((x) => x.name === was);
        const name = u.name?.trim().slice(0, 40) || was;
        if (name !== was && projects.some((x, j) => j !== i && same(x.name, name)))
          throw new Problem(`${b.ref} already has a project “${name}”.`);
        if (name !== was) reproject.set(was, name);
        projects[i] = { name, tone: u.tone ?? projects[i].tone };
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

      let retagged = 0;
      if (relabel.size || reproject.size) {
        const [{ data: tagged }, { data: planned }] = await Promise.all([
          relabel.size
            ? db.from("tasks").select("number, labels").eq("board_id", b.id).overlaps("labels", [...relabel.keys()])
            : Promise.resolve({ data: [] as { number: number; labels: string[] }[] }),
          reproject.size
            ? db.from("tasks").select("number, project").eq("board_id", b.id).in("project", [...reproject.keys()])
            : Promise.resolve({ data: [] as { number: number; project: string }[] }),
        ]);
        const changed = new Map<number, Record<string, unknown>>();
        for (const t of tagged ?? [])
          changed.set(t.number, { labels: (t.labels as string[]).map((l) => relabel.get(l) ?? l) });
        for (const t of planned ?? [])
          changed.set(t.number, { ...changed.get(t.number), project: reproject.get(t.project as string) });
        if (changed.size) await apply(b, { updated: [...changed].map(([number, fields]) => ({ number, fields })) });
        retagged = changed.size;
      }
      return compact({
        board: b.ref,
        name: (fields.name as string) ?? b.name,
        labels: nextLabels.map((l) => ({ name: l.id, tone: l.tone })),
        projects: nextProjects.map((x) => ({ name: x.name, tone: x.tone })),
        tasks_updated: retagged || undefined,
      });
    },

    async updateRoadmap(
      ref: string,
      p: {
        public?: boolean;
        title?: string;
        tagline?: string;
        voting?: boolean;
        ideas?: boolean;
        new_tasks_public?: boolean;
      },
    ) {
      const b = await board(ref);
      const change: Record<string, unknown> = {};
      if (p.public !== undefined && p.public !== b.roadmap_public) change.roadmap_public = p.public;
      const patch = compact({ title: p.title?.trim().slice(0, 80), tagline: p.tagline?.trim().slice(0, 400) });
      if (p.voting !== undefined) Object.assign(patch, { voting: p.voting });
      if (p.ideas !== undefined) Object.assign(patch, { ideas: p.ideas, ideasPublic: p.ideas });
      if (p.new_tasks_public !== undefined) Object.assign(patch, { newTasksPublic: p.new_tasks_public });
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
  new_tasks_public: page.newTasksPublic,
});

export type Acta = ReturnType<typeof actaFor>;
