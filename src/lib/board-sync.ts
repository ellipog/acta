import { shelfOf, type Gap, type Gaps, type Place, type Shelf } from "./board-shelves";
import {
  mergeIds,
  slotIn,
  type Activity,
  type BoardState,
  type Comment,
  type CustomValue,
  type Priority,
  type PublicPage,
  type Size,
  type StatusCategory,
  type Subtask,
  type Suggestion,
  type Task,
} from "./board-store";

export type TaskRow = {
  board_id: string;
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
  // Missing from a board's own reads, which leave descriptions for each task's dialog to read
  description?: string | null;
  subtasks: Subtask[];
  public: boolean;
  shipped_on: string | null;
  // Missing until the archive migration runs
  archived_at?: string | null;
  // Missing until the custom fields migration runs
  custom?: Record<string, CustomValue> | null;
  created_at?: string;
  // Missing until the closed times migration runs
  closed_at?: string | null;
  vote_count: number;
  position: number;
  origin: string | null;
  deleted_at: string | null;
};

export type CommentRow = {
  id: string;
  board_id: string;
  number: number;
  author: string | null;
  body: string;
  created_at: string;
  via?: string | null;
  author_name?: string | null;
};
export type ActivityRow = {
  id: string;
  board_id: string;
  number: number;
  actor: string | null;
  text: string;
  created_at: string;
  via?: string | null;
};
export type SuggestionRow = {
  id: string;
  board_id: string;
  title: string;
  details: string | null;
  by_name: string;
  vote_count: number;
  created_at: string;
};
export type BoardRow = { id: string; roadmap_public: boolean; page: Partial<PublicPage>; next_number: number };

export type SyncedField =
  | "title"
  | "status"
  | "priority"
  | "size"
  | "project"
  | "labels"
  | "start"
  | "due"
  | "assignee"
  | "description"
  | "subtasks"
  | "public"
  | "shipped"
  | "archived"
  | "custom";

// Every task field that's saved as a column of its own. A new field on Task belongs here unless it's kept some
// other way, which tests/board-save.test.ts checks
export const syncedFields: SyncedField[] = [
  "title",
  "status",
  "priority",
  "size",
  "project",
  "labels",
  "start",
  "due",
  "assignee",
  "description",
  "subtasks",
  "public",
  "shipped",
  "archived",
  "custom",
];

const wireName: Record<SyncedField, string> = {
  title: "title",
  status: "status",
  priority: "priority",
  size: "size",
  project: "project",
  labels: "labels",
  start: "start_on",
  due: "due_on",
  assignee: "assignee",
  description: "description",
  subtasks: "subtasks",
  public: "public",
  shipped: "shipped_on",
  archived: "archived_at",
  custom: "custom",
};

export const taskKey = (prefix: string, n: number) => `${prefix}-${n}`;
export const taskNumber = (id: string) => Number(id.slice(id.lastIndexOf("-") + 1));

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isUuid = (id?: string) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

function wireValue(task: Task, f: SyncedField) {
  const v = task[f];
  if (f === "public") return Boolean(v);
  if (f === "custom") return v ?? {};
  return v ?? null;
}

// Times the database stamps on a task by itself. They come back with every row, but are never sent
export const stampedFields = ["opened", "closed"] as const;

// The database writes times its own way, so they're read as ISO for the app to compare
const iso = (at?: string | null) => (at ? new Date(at).toISOString() : undefined);

export function fromRow(
  row: TaskRow,
): Pick<Task, SyncedField | "votes" | "position" | (typeof stampedFields)[number]> {
  return {
    opened: iso(row.created_at),
    closed: iso(row.closed_at),
    title: row.title,
    status: row.status,
    priority: row.priority,
    size: row.size ?? undefined,
    project: row.project ?? undefined,
    labels: row.labels ?? [],
    start: row.start_on ?? undefined,
    due: row.due_on ?? undefined,
    assignee: row.assignee ?? undefined,
    description: row.description ?? "",
    subtasks: row.subtasks ?? [],
    public: row.public,
    shipped: row.shipped_on ?? undefined,
    archived: row.archived_at ?? undefined,
    custom: row.custom && Object.keys(row.custom).length ? row.custom : undefined,
    votes: row.vote_count,
    position: row.position,
  };
}

type NameOf = (userId: string | null) => string;

export const commentFrom = (row: Omit<CommentRow, "board_id" | "number">, nameOf: NameOf): Comment => ({
  id: row.id,
  who: nameOf(row.author),
  at: Date.parse(row.created_at),
  body: row.body,
  via: row.via ?? undefined,
  from: row.author_name ?? undefined,
});

export const activityFrom = (row: Omit<ActivityRow, "board_id" | "number">, nameOf: NameOf): Activity => ({
  id: row.id,
  who: nameOf(row.actor),
  at: Date.parse(row.created_at),
  text: row.text,
  via: row.via ?? undefined,
});

const taskOf = (prefix: string, n?: number) => (n ? taskKey(prefix, n) : undefined);

export type Diff = {
  created: string[];
  updated: { id: string; fields: SyncedField[] }[];
  deleted: string[];
  // Tasks that took a new position, in their column or a new one. New tasks bring theirs with them
  placed: string[];
  comments: { task: string; comment: Comment }[];
  uncomments: { task: string; id: string }[];
  activity: { task: string; entry: Activity }[];
  unactivity: { task: string; id: string }[];
  voted: string[];
  unvoted: string[];
  roadmapPublic: boolean;
  page: boolean;
  suggested: string[];
  declined: string[];
  suggestionVoted: string[];
  suggestionUnvoted: string[];
};

export function emptyDiff(d: Diff) {
  return (
    !d.created.length &&
    !d.updated.length &&
    !d.deleted.length &&
    !d.placed.length &&
    !d.comments.length &&
    !d.uncomments.length &&
    !d.activity.length &&
    !d.unactivity.length &&
    !d.voted.length &&
    !d.unvoted.length &&
    !d.roadmapPublic &&
    !d.page &&
    !d.suggested.length &&
    !d.declined.length &&
    !d.suggestionVoted.length &&
    !d.suggestionUnvoted.length
  );
}

function byId<T extends { id?: string }>(list: T[] = []) {
  return new Map(list.filter((x) => isUuid(x.id)).map((x) => [x.id!, x]));
}

// A save only ever sends the comments and activity lines this tab wrote, or takes back one of those after an undo.
// Everything else in a thread came from the server, and a board holds only part of most threads until a task's
// dialog reads the rest. Comparing those would make a thread that hasn't been read yet, or an older copy of the
// board from before it was, look like comments and activity to delete
const own = <T extends { id?: string; local?: true }>(list: T[] = []) => byId(list.filter((x) => x.local));

export function diffBoards(base: BoardState, next: BoardState): Diff {
  const d: Diff = {
    created: [],
    updated: [],
    deleted: [],
    placed: [],
    comments: [],
    uncomments: [],
    activity: [],
    unactivity: [],
    voted: [],
    unvoted: [],
    roadmapPublic: base.roadmap.public !== next.roadmap.public,
    page: base.roadmap.page !== next.roadmap.page && !same(base.roadmap.page, next.roadmap.page),
    suggested: [],
    declined: [],
    suggestionVoted: [],
    suggestionUnvoted: [],
  };

  for (const [id, b] of Object.entries(next.tasks)) {
    const a = base.tasks[id];
    if (a === b) continue;
    if (!a) {
      d.created.push(id);
      if (b.voted) d.voted.push(id);
    } else {
      // A description one copy hasn't read is no change. Both copies read it at once, and until the other has, a
      // save would send the empty one over it, or the real one back for nothing
      const changed = syncedFields.filter((f) => !same(a[f], b[f]) && !(f === "description" && (a.brief || b.brief)));
      if (changed.length) d.updated.push({ id, fields: changed });
      if (Boolean(a.voted) !== Boolean(b.voted)) (b.voted ? d.voted : d.unvoted).push(id);
      if (a.position !== b.position && Number.isFinite(b.position)) d.placed.push(id);
    }
    const before = own(a?.thread);
    const after = own(b.thread);
    for (const [cid, c] of after) if (!before.has(cid)) d.comments.push({ task: id, comment: c });
    for (const cid of before.keys()) if (!after.has(cid)) d.uncomments.push({ task: id, id: cid });
    const was = own(a?.activity);
    const now = own(b.activity);
    for (const [aid, e] of now) if (!was.has(aid)) d.activity.push({ task: id, entry: e });
    for (const aid of was.keys()) if (!now.has(aid)) d.unactivity.push({ task: id, id: aid });
  }
  for (const id of Object.keys(base.tasks)) if (!next.tasks[id]) d.deleted.push(id);

  const was = new Map(base.roadmap.suggestions.map((s) => [s.id, s]));
  const now = new Map(next.roadmap.suggestions.map((s) => [s.id, s]));
  for (const [id, s] of now) {
    const prev = was.get(id);
    if (!prev) {
      if (isUuid(id)) d.suggested.push(id);
      if (s.voted) d.suggestionVoted.push(id);
    } else if (Boolean(prev.voted) !== Boolean(s.voted)) (s.voted ? d.suggestionVoted : d.suggestionUnvoted).push(id);
  }
  for (const id of was.keys()) if (!now.has(id)) d.declined.push(id);

  return d;
}

/** The tasks a save would put back whole, as it does one an undo brings back, without the description this copy
 * never read. Saved like that, the empty one would go over the real one, so the save waits until they're read */
export const unreadBack = (d: Diff, state: BoardState) => d.created.filter((id) => state.tasks[id]?.brief);

export function toWire(d: Diff, state: BoardState) {
  const n = taskNumber;
  // Every task the app makes is given a position. Its place in the column stands in, should one ever be missing
  const positionOf = (id: string) => {
    const t = state.tasks[id];
    return Number.isFinite(t?.position) ? t.position! : t ? Math.max(0, state.columns[t.status].indexOf(id)) : 0;
  };
  const created = d.created.map((id) => {
    const t = state.tasks[id];
    const row: Record<string, unknown> = {
      number: n(id),
      position: positionOf(id),
      origin: t.origin ?? null,
    };
    for (const f of syncedFields) row[wireName[f]] = wireValue(t, f);
    return row;
  });
  return {
    created,
    updated: d.updated.map(({ id, fields: changed }) => ({
      number: n(id),
      fields: Object.fromEntries(changed.map((f) => [wireName[f], wireValue(state.tasks[id], f)])),
    })),
    deleted: d.deleted.map(n),
    // Only the cards that moved. The rest of the column keeps the positions it has
    order: d.placed.map((id) => ({ number: n(id), position: positionOf(id) })),
    voted: d.voted.map(n),
    unvoted: d.unvoted.map(n),
    comments: d.comments.map(({ task, comment }) => ({ id: comment.id, number: n(task), body: comment.body })),
    uncomments: d.uncomments.map((c) => c.id),
    activity: d.activity.map(({ task, entry }) => ({ id: entry.id, number: n(task), text: entry.text })),
    unactivity: d.unactivity.map((a) => a.id),
    ...(d.roadmapPublic || d.page
      ? {
          board: {
            ...(d.roadmapPublic ? { roadmap_public: state.roadmap.public } : {}),
            ...(d.page ? { page: state.roadmap.page } : {}),
          },
        }
      : {}),
    suggested: d.suggested.map((id) => {
      const s = state.roadmap.suggestions.find((x) => x.id === id)!;
      return { id, title: s.title, details: s.details ?? null };
    }),
    declined: d.declined,
    suggestionVoted: d.suggestionVoted,
    suggestionUnvoted: d.suggestionUnvoted,
  };
}

export function absorb(target: BoardState, source: BoardState, d: Diff): BoardState {
  const tasks = { ...target.tasks };
  const touched = new Set<string>();
  const edit = (id: string) => {
    if (!tasks[id]) return null;
    if (!touched.has(id)) {
      tasks[id] = { ...tasks[id] };
      touched.add(id);
    }
    return tasks[id];
  };

  for (const id of d.created) {
    tasks[id] = source.tasks[id];
    touched.add(id);
  }
  for (const id of d.deleted) delete tasks[id];
  for (const { id, fields: changed } of d.updated) {
    const t = edit(id);
    if (!t) continue;
    for (const f of changed) (t as Record<string, unknown>)[f] = source.tasks[id]?.[f];
    // The closed time follows the status. Kept with it, the database's own time can replace it when it comes back
    if (changed.includes("status")) t.closed = source.tasks[id]?.closed;
  }
  for (const id of d.placed) {
    const t = edit(id);
    if (t) t.position = source.tasks[id]?.position ?? t.position;
  }
  for (const id of d.voted) {
    const t = edit(id);
    if (t && !d.created.includes(id)) {
      t.voted = true;
      t.votes = source.tasks[id]?.votes ?? t.votes;
    }
  }
  for (const id of d.unvoted) {
    const t = edit(id);
    if (t) {
      t.voted = false;
      t.votes = source.tasks[id]?.votes ?? t.votes;
    }
  }
  // The count moves with each comment rather than being the thread's length, as a thread may be only part of it
  for (const { task, comment } of d.comments) {
    const t = edit(task);
    if (t && !d.created.includes(task) && !(t.thread ?? []).some((c) => c.id === comment.id)) {
      t.thread = [...(t.thread ?? []), comment];
      t.comments += 1;
    }
  }
  for (const { task, id } of d.uncomments) {
    const t = edit(task);
    const thread = t?.thread?.filter((c) => c.id !== id);
    if (t && thread && thread.length !== t.thread!.length) {
      t.thread = thread;
      t.comments = Math.max(0, t.comments - 1);
    }
  }
  for (const { task, entry } of d.activity) {
    const t = edit(task);
    if (t && !d.created.includes(task) && !t.activity.some((a) => a.id === entry.id))
      t.activity = [...t.activity, entry];
  }
  for (const { task, id } of d.unactivity) {
    const t = edit(task);
    if (t) t.activity = t.activity.filter((a) => a.id !== id);
  }

  // Columns are kept in order by position, so each card these changes moved goes where its position says, among
  // the others in the places they have here
  const columns = { ...target.columns };
  for (const s of Object.keys(columns) as StatusCategory[])
    columns[s] = columns[s].filter((id) => tasks[id] && tasks[id].status === s);
  const moved = new Set([...d.created, ...d.placed, ...d.updated.filter((u) => u.fields.includes("status")).map((u) => u.id)]);
  for (const id of moved) {
    const t = tasks[id];
    if (t) columns[t.status] = slotIn(columns[t.status] ?? [], tasks, id);
  }

  const sourceSuggestions = new Map(source.roadmap.suggestions.map((s) => [s.id, s]));
  let suggestions = target.roadmap.suggestions.filter((s) => !d.declined.includes(s.id));
  for (const id of d.suggested)
    if (!suggestions.some((s) => s.id === id)) suggestions = [sourceSuggestions.get(id)!, ...suggestions];
  suggestions = suggestions.map((s) =>
    d.suggestionVoted.includes(s.id) || d.suggestionUnvoted.includes(s.id)
      ? { ...s, voted: d.suggestionVoted.includes(s.id), votes: sourceSuggestions.get(s.id)?.votes ?? s.votes }
      : s,
  );

  return {
    ...target,
    next: Math.max(target.next, source.next),
    tasks,
    columns,
    roadmap: {
      public: d.roadmapPublic ? source.roadmap.public : target.roadmap.public,
      page: d.page ? source.roadmap.page : target.roadmap.page,
      suggestions,
    },
  };
}

export function renumber(state: BoardState, from: string, to: string): BoardState {
  const task = state.tasks[from];
  if (!task || from === to) return state;
  const tasks = { ...state.tasks };
  delete tasks[from];
  tasks[to] = { ...task, id: to };
  const columns = Object.fromEntries(
    Object.entries(state.columns).map(([s, ids]) => [s, ids.map((id) => (id === from ? to : id))]),
  ) as BoardState["columns"];
  return { ...state, tasks, columns, next: Math.max(state.next, taskNumber(to) + 1) };
}

// What base, the copy the server last confirmed, held of a task's comments and activity when a read of them began
export type Held = { comments: string[]; activity: string[] };

export type Change =
  // fresh: a task just made, rather than one this copy hadn't read
  | { kind: "task"; id: string; remove?: boolean; add?: Task; fields?: Partial<Task>; fresh?: boolean }
  // Tasks read from the server that this copy didn't hold: a page of a shelf, read in board order up to through, or
  // tasks something needed by number. whole: the shelf has nothing more to read
  | { kind: "held"; tasks: Task[]; shelf?: Shelf; through?: Place; whole?: boolean }
  // The shelves' counts read again, as how many tasks each still has on the server and where the last of them sits
  | { kind: "gaps"; gaps: Partial<Record<Shelf, Pick<Gap, "rest" | "tail">>> }
  // fresh: the comment is known to be new since the board was read, so it adds to the count of a partial thread
  | { kind: "comment"; task: string; comment: Comment; fresh?: boolean }
  | { kind: "uncomment"; id: string; task?: string }
  | { kind: "activity"; task: string; entry: Activity }
  | { kind: "unactivity"; id: string; task?: string }
  // A task's whole thread and newest activity, and its description, as read when its dialog opens. complete: every
  // activity line is in it
  | {
      kind: "thread";
      task: string;
      comments: Comment[];
      activity: Activity[];
      complete: boolean;
      had: Held;
      description?: string;
    }
  // Every public task, read whole for the public roadmap, for the descriptions of those held without one
  | { kind: "public"; tasks: Task[] }
  // Comment counts and latest activity lines read for partial tasks, with what base held of each
  | { kind: "counts"; counts: Record<string, number>; latest: Record<string, Activity>; had: Record<string, string[]> }
  | { kind: "suggestion"; suggestion: Suggestion }
  | { kind: "unsuggestion"; id: string }
  | { kind: "board"; public?: boolean; page?: PublicPage; next?: number }
  | { kind: "none" };

// A removed comment or activity line comes as old. Live, that holds only its id. Catching up reads where it was too
export type RemoteEvent =
  // fresh: the row was just inserted, so it's a new task rather than one this copy hadn't read
  | { table: "tasks"; row: TaskRow; fresh?: boolean }
  | { table: "comments"; row?: CommentRow; old?: { id: string; number?: number }; fresh?: boolean }
  | { table: "activity"; row?: ActivityRow; old?: { id: string; number?: number } }
  | { table: "suggestions"; row?: SuggestionRow; old?: { id: string } }
  | { table: "boards"; row: BoardRow };

export type Context = {
  prefix: string;
  nameOf: NameOf;
  page: (p: Partial<PublicPage>) => PublicPage;
};

export function resolve(base: BoardState, ev: RemoteEvent, ctx: Context): Change {
  switch (ev.table) {
    case "tasks": {
      const id = taskKey(ctx.prefix, ev.row.number);
      const prev = base.tasks[id];
      if (ev.row.deleted_at) return prev ? { kind: "task", id, remove: true } : { kind: "none" };
      const incoming = fromRow(ev.row);
      // A row read without its description says nothing about it
      const described = typeof ev.row.description === "string";
      if (!prev)
        return {
          kind: "task",
          id,
          fresh: ev.fresh,
          add: {
            id,
            ...incoming,
            comments: 0,
            thread: [],
            activity: [],
            voted: false,
            origin: ev.row.origin ?? undefined,
            // Its comments and activity follow on their own, and its dialog reads them in case any didn't
            partial: true,
            ...(described ? {} : { brief: true as const }),
          },
        };
      const changed: Partial<Task> = {};
      // The position is one field like the others: a card someone moved comes with its new one
      for (const f of [...syncedFields, ...stampedFields, "votes", "position"] as (keyof typeof incoming)[]) {
        // A row without the column, like one from before the closed times migration, says nothing about it
        if ((f === "closed" && !("closed_at" in ev.row)) || (f === "opened" && !ev.row.created_at)) continue;
        if (f === "description" && !described) continue;
        if (!same(prev[f], incoming[f])) (changed as Record<string, unknown>)[f] = incoming[f];
      }
      // The description this copy hadn't read
      if (prev.brief && described) {
        changed.description = incoming.description;
        changed.brief = undefined;
      }
      return Object.keys(changed).length ? { kind: "task", id, fields: changed } : { kind: "none" };
    }
    case "comments":
      if (ev.row)
        return {
          kind: "comment",
          task: taskKey(ctx.prefix, ev.row.number),
          comment: commentFrom(ev.row, ctx.nameOf),
          fresh: ev.fresh,
        };
      return ev.old ? { kind: "uncomment", id: ev.old.id, task: taskOf(ctx.prefix, ev.old.number) } : { kind: "none" };
    case "activity":
      if (ev.row) return { kind: "activity", task: taskKey(ctx.prefix, ev.row.number), entry: activityFrom(ev.row, ctx.nameOf) };
      return ev.old ? { kind: "unactivity", id: ev.old.id, task: taskOf(ctx.prefix, ev.old.number) } : { kind: "none" };
    case "suggestions":
      if (ev.row) {
        const prev = base.roadmap.suggestions.find((s) => s.id === ev.row!.id);
        return {
          kind: "suggestion",
          suggestion: {
            id: ev.row.id,
            title: ev.row.title,
            details: ev.row.details ?? undefined,
            by: ev.row.by_name,
            at: Date.parse(ev.row.created_at),
            votes: ev.row.vote_count,
            voted: prev?.voted ?? false,
          },
        };
      }
      return ev.old ? { kind: "unsuggestion", id: ev.old.id } : { kind: "none" };
    case "boards":
      return { kind: "board", public: ev.row.roadmap_public, page: ctx.page(ev.row.page), next: ev.row.next_number };
  }
}

export function apply(state: BoardState, c: Change, pending?: BoardState): BoardState {
  switch (c.kind) {
    case "none":
      return state;
    case "task": {
      const prev = state.tasks[c.id];
      if (c.remove) {
        if (!prev) return state;
        const tasks = { ...state.tasks };
        delete tasks[c.id];
        return {
          ...state,
          tasks,
          columns: { ...state.columns, [prev.status]: state.columns[prev.status].filter((x) => x !== c.id) },
        };
      }
      if (c.add) {
        if (prev) return state;
        const tasks = { ...state.tasks, [c.id]: c.add };
        return {
          ...state,
          next: Math.max(state.next, taskNumber(c.id) + 1),
          tasks,
          columns: { ...state.columns, [c.add.status]: slotIn(state.columns[c.add.status] ?? [], tasks, c.id) },
          // A task this copy hadn't read was one of its shelf's rest. A new one never was
          gaps: c.fresh ? state.gaps : heldOne(state.gaps, [c.add]),
        };
      }
      if (!prev || !c.fields) return state;
      // A field changed here and not saved yet, like a card you just moved, keeps your value over theirs
      const base = pending?.tasks[c.id];
      const patch = Object.fromEntries(
        Object.entries(c.fields).filter(([f]) => !base || same(prev[f as keyof Task], base[f as keyof Task])),
      ) as Partial<Task>;
      if (!Object.keys(patch).length) return state;
      const task = { ...prev, ...patch };
      const tasks = { ...state.tasks, [c.id]: task };
      let columns = state.columns;
      if (task.status !== prev.status || task.position !== prev.position) {
        columns = { ...columns, [prev.status]: columns[prev.status].filter((x) => x !== c.id) };
        columns[task.status] = slotIn(columns[task.status] ?? [], tasks, c.id);
      }
      return { ...state, tasks, columns };
    }
    case "comment": {
      const t = state.tasks[c.task];
      if (!t) return state;
      const known = (t.thread ?? []).find((x) => x.id === c.comment.id);
      if (known) {
        // An edited comment
        if (known.body === c.comment.body) return state;
        const thread = t.thread!.map((x) => (x === known ? { ...x, body: c.comment.body } : x));
        return { ...state, tasks: { ...state.tasks, [c.task]: { ...t, thread } } };
      }
      const thread = [...(t.thread ?? []), c.comment].sort((a, b) => a.at - b.at);
      // A partial thread keeps a comment it didn't have, for its dialog. Unless it's known to be new, like one that
      // just came in live, it may already be in the count, which the caller reads again instead
      const comments = t.partial && !c.fresh ? t.comments : t.comments + 1;
      return { ...state, tasks: { ...state.tasks, [c.task]: { ...t, thread, comments } } };
    }
    case "uncomment": {
      const entry = c.task
        ? state.tasks[c.task]
        : Object.values(state.tasks).find((t) => t.thread?.some((x) => x.id === c.id));
      if (!entry?.thread?.some((x) => x.id === c.id)) return state;
      const thread = entry.thread.filter((x) => x.id !== c.id);
      const comments = Math.max(0, entry.comments - 1);
      return { ...state, tasks: { ...state.tasks, [entry.id]: { ...entry, thread, comments } } };
    }
    case "activity": {
      const t = state.tasks[c.task];
      if (!t || t.activity.some((x) => x.id === c.entry.id)) return state;
      const activity = [...t.activity, c.entry].sort((a, b) => a.at - b.at);
      return { ...state, tasks: { ...state.tasks, [c.task]: { ...t, activity } } };
    }
    case "unactivity": {
      const entry = c.task
        ? state.tasks[c.task]
        : Object.values(state.tasks).find((t) => t.activity.some((x) => x.id === c.id));
      if (!entry?.activity.some((x) => x.id === c.id)) return state;
      return {
        ...state,
        tasks: { ...state.tasks, [entry.id]: { ...entry, activity: entry.activity.filter((x) => x.id !== c.id) } },
      };
    }
    case "thread": {
      const t = state.tasks[c.task];
      if (!t) return state;
      const thread = settle(t.thread ?? [], c.comments, c.had.comments, true);
      const activity = settle(t.activity, c.activity, c.had.activity, c.complete);
      const whole: Task = { ...t, thread, comments: thread.length, activity };
      delete whole.partial;
      // A description held already is as new as the read, or newer: the live feed brings every change to it. A task
      // with no row left has none to read, and none a save could go over
      if (t.brief) {
        if (c.description !== undefined) whole.description = c.description;
        delete whole.brief;
      }
      return { ...state, tasks: { ...state.tasks, [c.task]: whole } };
    }
    case "public": {
      // Those held without their description get it. Those not held come in first, as any read of tasks does
      let tasks = state.tasks;
      for (const t of c.tasks) {
        const now = tasks[t.id];
        if (!now?.brief || t.brief) continue;
        if (tasks === state.tasks) tasks = { ...tasks };
        const whole: Task = { ...now, description: t.description };
        delete whole.brief;
        tasks[t.id] = whole;
      }
      return { ...state, tasks, publicHeld: true };
    }
    case "counts": {
      let tasks = state.tasks;
      for (const id of new Set([...Object.keys(c.counts), ...Object.keys(c.latest)])) {
        const t = tasks[id];
        // A thread that's been read keeps its own count, which every change to it moves
        if (!t?.partial) continue;
        let next = t;
        if (id in c.counts) {
          // The server's count, plus what this copy has added to or taken from the thread base held
          const had = new Set(c.had[id] ?? []);
          const mine = new Set((t.thread ?? []).map((x) => x.id));
          const added = [...mine].filter((x) => !had.has(x)).length;
          const removed = [...had].filter((x) => !mine.has(x)).length;
          const comments = Math.max(0, c.counts[id] + added - removed);
          if (comments !== t.comments) next = { ...next, comments };
        }
        const line = c.latest[id];
        if (line && !t.activity.some((a) => a.id === line.id))
          next = { ...next, activity: [...t.activity, line].sort((a, b) => a.at - b.at) };
        if (next === t) continue;
        if (tasks === state.tasks) tasks = { ...tasks };
        tasks[id] = next;
      }
      return tasks === state.tasks ? state : { ...state, tasks };
    }
    case "held": {
      // A task already held stays as it is, newer than anything a read that started earlier can bring
      let tasks = state.tasks;
      const added: Task[] = [];
      for (const t of c.tasks) {
        if (tasks[t.id]) continue;
        if (tasks === state.tasks) tasks = { ...tasks };
        tasks[t.id] = t;
        added.push(t);
      }
      let gaps = heldOne(state.gaps, added);
      const gap = c.shelf ? gaps?.[c.shelf] : undefined;
      if (c.shelf && gap) {
        if (c.whole) {
          gaps = { ...gaps };
          delete gaps[c.shelf];
          if (!Object.keys(gaps).length) gaps = undefined;
        } else if (c.through && (!gap.through || placeAbove(gap.through, c.through))) {
          // Reading only moves on down the shelf
          gaps = { ...gaps, [c.shelf]: { ...gap, through: c.through } };
        }
      }
      if (!added.length && gaps === state.gaps) return state;
      let columns = state.columns;
      const byStatus = new Map<StatusCategory, string[]>();
      for (const t of added) byStatus.set(t.status, [...(byStatus.get(t.status) ?? []), t.id]);
      if (byStatus.size) {
        columns = { ...columns };
        for (const [s, ids] of byStatus) columns[s] = mergeIds(columns[s] ?? [], tasks, ids);
      }
      const next = added.reduce((n, t) => Math.max(n, taskNumber(t.id) + 1), state.next);
      return { ...state, next, tasks, columns, gaps };
    }
    case "gaps": {
      // Only reading a shelf to its end shows it's held whole, so a count never closes a gap, however low it reads
      if (!state.gaps) return state;
      let gaps = state.gaps;
      for (const [s, g] of Object.entries(c.gaps) as [Shelf, Pick<Gap, "rest" | "tail">][]) {
        const now = gaps[s];
        if (!now || (now.rest === g.rest && now.tail === g.tail)) continue;
        if (gaps === state.gaps) gaps = { ...gaps };
        gaps[s] = { ...now, rest: g.rest === undefined ? undefined : Math.max(0, g.rest), tail: g.tail };
      }
      return gaps === state.gaps ? state : { ...state, gaps };
    }
    case "suggestion": {
      const list = state.roadmap.suggestions;
      const i = list.findIndex((s) => s.id === c.suggestion.id);
      const suggestions =
        i === -1 ? [c.suggestion, ...list] : list.map((s, j) => (j === i ? { ...c.suggestion, voted: s.voted } : s));
      return { ...state, roadmap: { ...state.roadmap, suggestions } };
    }
    case "unsuggestion":
      return {
        ...state,
        roadmap: { ...state.roadmap, suggestions: state.roadmap.suggestions.filter((s) => s.id !== c.id) },
      };
    case "board": {
      const keepPublic = pending && pending.roadmap.public !== state.roadmap.public;
      const keepPage = pending && pending.roadmap.page !== state.roadmap.page;
      const next = Math.max(state.next, c.next ?? 0);
      const isPublic = keepPublic || c.public === undefined ? state.roadmap.public : c.public;
      // Every task created bumps the board's row, so an unchanged page keeps its object and nothing redraws
      const page = keepPage || !c.page || same(c.page, state.roadmap.page) ? state.roadmap.page : c.page;
      if (next === state.next && isPublic === state.roadmap.public && page === state.roadmap.page) return state;
      return { ...state, next, roadmap: { ...state.roadmap, public: isPublic, page } };
    }
  }
}

/** The gaps once some tasks that were on the server are held here, each of them one fewer in its shelf's rest. A
 * shelf only counts as held whole once it's been read to its end, so a rest that reaches nothing keeps its gap */
function heldOne(gaps: Gaps | undefined, added: Task[]): Gaps | undefined {
  if (!gaps || !added.length) return gaps;
  let out = gaps;
  for (const t of added) {
    const s = shelfOf(t);
    const g = out[s];
    if (!g?.rest) continue;
    if (out === gaps) out = { ...gaps };
    out[s] = { ...g, rest: g.rest - 1 };
  }
  return out;
}

/** Whether one place on a shelf is above another */
export const placeAbove = (a: Place, b: Place) =>
  a.position < b.position || (a.position === b.position && a.number < b.number);

/** The partial tasks a change from the server leaves unsure of their comment count or latest activity line, to be
 * read again. "all" when it can't tell which. after is what applying the change to before made */
export function unsure(before: BoardState, after: BoardState, c: Change): number[] | "all" | null {
  switch (c.kind) {
    case "comment": {
      // One the thread didn't hold, which may or may not be in its count already
      const t = before.tasks[c.task];
      return t?.partial && !c.fresh && !t.thread?.some((x) => x.id === c.comment.id) ? [taskNumber(c.task)] : null;
    }
    case "uncomment": {
      // A thread that held it counted it, and the count went with it
      if (after !== before) return null;
      if (c.task) return before.tasks[c.task]?.partial ? [taskNumber(c.task)] : null;
      // Live, a deleted comment says only its id, and one no thread held was in some partial task's count
      return Object.values(before.tasks).some((t) => t.partial) ? "all" : null;
    }
    case "unactivity": {
      // A partial task that loses its latest line reads the one before it
      const t = c.task
        ? before.tasks[c.task]
        : Object.values(before.tasks).find((x) => x.activity.some((a) => a.id === c.id));
      return t?.partial && t.activity.at(-1)?.id === c.id ? [taskNumber(t.id)] : null;
    }
    default:
      return null;
  }
}

/** What one copy of a thread or activity log becomes once the server's own list for the task is read. had is what
 * base held when the read began. Of those, any the server no longer lists were deleted, and every copy loses them.
 * What the server lists that base didn't hold is new to every copy. Anything else is the copy's own business, like
 * a comment written here and not saved yet, or one an undo took back, so it's left as the copy has it. Only the
 * newest activity is read, so unless the list is complete, a line older than all of it is left alone too */
export function settle<T extends { id?: string; at: number }>(list: T[], read: T[], had: string[], complete: boolean): T[] {
  const known = new Set(had);
  const listed = new Set(read.map((x) => x.id));
  const oldest = complete || !read.length ? -Infinity : Math.min(...read.map((x) => x.at));
  const gone = (x: T) => !!x.id && known.has(x.id) && !listed.has(x.id) && x.at >= oldest;
  const kept = list.filter((x) => !gone(x));
  const have = new Set(kept.map((x) => x.id));
  const added = read.filter((x) => x.id && !known.has(x.id) && !have.has(x.id));
  if (!added.length && kept.length === list.length) return list;
  return [...kept, ...added].sort((a, b) => a.at - b.at);
}

/** A board read again holds none of its threads. The comments and activity lines this tab wrote that base held are
 * kept in it, so an undo that hasn't saved yet can still take one of them back */
export function keepOwn(fresh: BoardState, before: BoardState): BoardState {
  let tasks = fresh.tasks;
  for (const [id, t] of Object.entries(fresh.tasks)) {
    const was = before.tasks[id];
    if (!t.partial || !was) continue;
    const comments = (was.thread ?? []).filter((c) => c.local && !t.thread?.some((x) => x.id === c.id));
    const lines = was.activity.filter((a) => a.local && !t.activity.some((x) => x.id === a.id));
    if (!comments.length && !lines.length) continue;
    if (tasks === fresh.tasks) tasks = { ...tasks };
    // They're saved, so the count already has them
    tasks[id] = {
      ...t,
      thread: [...(t.thread ?? []), ...comments].sort((a, b) => a.at - b.at),
      activity: [...t.activity, ...lines].sort((a, b) => a.at - b.at),
    };
  }
  return tasks === fresh.tasks ? fresh : { ...fresh, tasks };
}

/** The ids of what a task's thread and activity hold, for a read of them that starts now */
export function heldBy(task: Task | undefined): Held {
  return {
    comments: (task?.thread ?? []).map((c) => c.id),
    activity: (task?.activity ?? []).flatMap((a) => (a.id ? [a.id] : [])),
  };
}

// How long this tab remembers what it saved, to know its own echoes
const ECHO_WINDOW = 30_000;

// JSON with object keys in a set order. The database stores JSON with its keys reordered
const canon = (v: unknown) =>
  JSON.stringify(v ?? null, (_, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  );

type Sent = { at: number; value: string };

/**
 * What this tab saved lately. Each save comes back over the live feed, and an echo of an older save can arrive
 * after a newer one has already been made. Applied as it is, it would put the older value back on screen, and
 * whatever was typed next would build on it. This tells those echoes apart from changes made by someone else
 */
export class SentLog {
  private log = new Map<string, Sent[]>();

  private push(key: string, value: unknown, now: number) {
    const list = (this.log.get(key) ?? []).filter((e) => now - e.at < ECHO_WINDOW);
    list.push({ at: now, value: canon(value) });
    this.log.set(key, list);
  }

  /** Notes what a save that went through set, read from the state it was sent from */
  record(d: Diff, state: BoardState, now = Date.now()) {
    for (const id of d.created) for (const f of syncedFields) this.push(`${id}:${f}`, state.tasks[id]?.[f], now);
    for (const u of d.updated) for (const f of u.fields) this.push(`${u.id}:${f}`, state.tasks[u.id]?.[f], now);
    // A card dragged twice in quick succession mustn't jump back to where the first drag left it
    for (const id of [...d.created, ...d.placed]) this.push(`${id}:position`, state.tasks[id]?.position, now);
    if (d.roadmapPublic) this.push("board:public", state.roadmap.public, now);
    if (d.page) this.push("board:page", state.roadmap.page, now);
  }

  /** Whether a value is one this tab saved and has since replaced */
  stale(key: string, value: unknown, now = Date.now()) {
    const list = (this.log.get(key) ?? []).filter((e) => now - e.at < ECHO_WINDOW);
    if (list.length < 2) return false;
    const v = canon(value);
    return list.at(-1)!.value !== v && list.slice(0, -1).some((e) => e.value === v);
  }

  /** The change without what only repeats an older save of this tab's */
  screen(c: Change, now = Date.now()): Change {
    if (c.kind === "task" && c.fields) {
      const fresh = Object.entries(c.fields).filter(([f, v]) => !this.stale(`${c.id}:${f}`, v, now));
      // The closed time and the position belong to the status they came with, so they go when that does
      const kept =
        "status" in c.fields && !fresh.some(([f]) => f === "status")
          ? fresh.filter(([f]) => f !== "closed" && f !== "position")
          : fresh;
      if (kept.length === Object.keys(c.fields).length) return c;
      return kept.length ? { ...c, fields: Object.fromEntries(kept) as Partial<Task> } : { kind: "none" };
    }
    if (c.kind === "board") {
      const out = { ...c };
      if (c.public !== undefined && this.stale("board:public", c.public, now)) out.public = undefined;
      if (c.page && this.stale("board:page", c.page, now)) out.page = undefined;
      return out;
    }
    return c;
  }
}
