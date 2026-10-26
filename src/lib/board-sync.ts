import type {
  Activity,
  BoardState,
  Comment,
  Priority,
  PublicPage,
  Size,
  StatusCategory,
  Subtask,
  Suggestion,
  Task,
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
  description: string;
  subtasks: Subtask[];
  public: boolean;
  shipped_on: string | null;
  // Missing until the archive migration runs
  archived_at?: string | null;
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

type SyncedField =
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
  | "archived";

const fields: SyncedField[] = [
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
};

export const taskKey = (prefix: string, n: number) => `${prefix}-${n}`;
export const taskNumber = (id: string) => Number(id.slice(id.lastIndexOf("-") + 1));

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const sameList = (a: string[], b: string[]) => a === b || (a.length === b.length && a.every((x, i) => x === b[i]));
const isUuid = (id?: string) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

function wireValue(task: Task, f: SyncedField) {
  const v = task[f];
  if (f === "public") return Boolean(v);
  return v ?? null;
}

export function fromRow(row: TaskRow): Pick<Task, SyncedField | "votes"> {
  return {
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
    votes: row.vote_count,
  };
}

export type Diff = {
  created: string[];
  updated: { id: string; fields: SyncedField[] }[];
  deleted: string[];
  columns: StatusCategory[];
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
    !d.columns.length &&
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

export function diffBoards(base: BoardState, next: BoardState): Diff {
  const d: Diff = {
    created: [],
    updated: [],
    deleted: [],
    columns: [],
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
      const changed = fields.filter((f) => !same(a[f], b[f]));
      if (changed.length) d.updated.push({ id, fields: changed });
      if (Boolean(a.voted) !== Boolean(b.voted)) (b.voted ? d.voted : d.unvoted).push(id);
    }
    const before = byId(a?.thread);
    const after = byId(b.thread);
    for (const [cid, c] of after) if (!before.has(cid)) d.comments.push({ task: id, comment: c });
    for (const cid of before.keys()) if (!after.has(cid)) d.uncomments.push({ task: id, id: cid });
    const was = byId(a?.activity);
    const now = byId(b.activity);
    for (const [aid, e] of now) if (!was.has(aid)) d.activity.push({ task: id, entry: e });
    for (const aid of was.keys()) if (!now.has(aid)) d.unactivity.push({ task: id, id: aid });
  }
  for (const id of Object.keys(base.tasks)) if (!next.tasks[id]) d.deleted.push(id);

  for (const s of Object.keys(next.columns) as StatusCategory[])
    if (!sameList(base.columns[s] ?? [], next.columns[s])) d.columns.push(s);

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

export function toWire(d: Diff, state: BoardState) {
  const n = taskNumber;
  const positionOf = (id: string) => {
    const t = state.tasks[id];
    return t ? state.columns[t.status].indexOf(id) : 0;
  };
  const created = d.created.map((id) => {
    const t = state.tasks[id];
    const row: Record<string, unknown> = {
      number: n(id),
      position: Math.max(0, positionOf(id)),
      origin: t.origin ?? null,
    };
    for (const f of fields) row[wireName[f]] = wireValue(t, f);
    return row;
  });
  const createdSet = new Set(d.created);
  return {
    created,
    updated: d.updated.map(({ id, fields: changed }) => ({
      number: n(id),
      fields: Object.fromEntries(changed.map((f) => [wireName[f], wireValue(state.tasks[id], f)])),
    })),
    deleted: d.deleted.map(n),
    order: d.columns.flatMap((s) =>
      state.columns[s].flatMap((id, i) => (createdSet.has(id) ? [] : [{ number: n(id), position: i }])),
    ),
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
  for (const { task, comment } of d.comments) {
    const t = edit(task);
    if (t && !d.created.includes(task) && !(t.thread ?? []).some((c) => c.id === comment.id)) {
      t.thread = [...(t.thread ?? []), comment];
      t.comments = t.thread.length;
    }
  }
  for (const { task, id } of d.uncomments) {
    const t = edit(task);
    if (t) {
      t.thread = (t.thread ?? []).filter((c) => c.id !== id);
      t.comments = t.thread.length;
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

  const columns = { ...target.columns };
  for (const s of Object.keys(columns) as StatusCategory[]) {
    columns[s] = d.columns.includes(s)
      ? source.columns[s].filter((id) => tasks[id])
      : columns[s].filter((id) => tasks[id] && tasks[id].status === s);
  }
  for (const id of [...d.created, ...d.updated.filter((u) => u.fields.includes("status")).map((u) => u.id)]) {
    const t = tasks[id];
    if (t && !columns[t.status].includes(id)) columns[t.status] = [...columns[t.status], id];
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

export type Change =
  | { kind: "task"; id: string; remove?: boolean; add?: Task; fields?: Partial<Task>; position: number }
  | { kind: "comment"; task: string; comment: Comment }
  | { kind: "uncomment"; id: string }
  | { kind: "activity"; task: string; entry: Activity }
  | { kind: "unactivity"; id: string }
  | { kind: "suggestion"; suggestion: Suggestion }
  | { kind: "unsuggestion"; id: string }
  | { kind: "board"; public?: boolean; page?: PublicPage; next?: number }
  | { kind: "reorder"; status: StatusCategory }
  | { kind: "column"; status: StatusCategory; ids: string[] }
  | { kind: "none" };

export type RemoteEvent =
  | { table: "tasks"; row: TaskRow }
  | { table: "comments"; row?: CommentRow; old?: { id: string } }
  | { table: "activity"; row?: ActivityRow; old?: { id: string } }
  | { table: "suggestions"; row?: SuggestionRow; old?: { id: string } }
  | { table: "boards"; row: BoardRow }
  | { table: "order"; status: StatusCategory; numbers: number[] };

export type Context = {
  prefix: string;
  nameOf: (userId: string | null) => string;
  page: (p: Partial<PublicPage>) => PublicPage;
};

export function resolve(base: BoardState, ev: RemoteEvent, ctx: Context): Change {
  switch (ev.table) {
    case "tasks": {
      const id = taskKey(ctx.prefix, ev.row.number);
      const prev = base.tasks[id];
      if (ev.row.deleted_at) return prev ? { kind: "task", id, remove: true, position: 0 } : { kind: "none" };
      const incoming = fromRow(ev.row);
      if (!prev)
        return {
          kind: "task",
          id,
          position: ev.row.position,
          add: {
            id,
            ...incoming,
            comments: 0,
            thread: [],
            activity: [],
            voted: false,
            origin: ev.row.origin ?? undefined,
          },
        };
      const changed: Partial<Task> = {};
      for (const f of [...fields, "votes"] as (SyncedField | "votes")[])
        if (!same(prev[f], incoming[f])) (changed as Record<string, unknown>)[f] = incoming[f];
      if (Object.keys(changed).length) return { kind: "task", id, fields: changed, position: ev.row.position };
      // Only the position changed, so someone reordered the column
      return Math.round(ev.row.position) === base.columns[prev.status].indexOf(id)
        ? { kind: "none" }
        : { kind: "reorder", status: prev.status };
    }
    case "comments":
      if (ev.row)
        return {
          kind: "comment",
          task: taskKey(ctx.prefix, ev.row.number),
          comment: {
            id: ev.row.id,
            who: ctx.nameOf(ev.row.author),
            at: Date.parse(ev.row.created_at),
            body: ev.row.body,
            via: ev.row.via ?? undefined,
            from: ev.row.author_name ?? undefined,
          },
        };
      return ev.old ? { kind: "uncomment", id: ev.old.id } : { kind: "none" };
    case "activity":
      if (ev.row)
        return {
          kind: "activity",
          task: taskKey(ctx.prefix, ev.row.number),
          entry: {
            id: ev.row.id,
            who: ctx.nameOf(ev.row.actor),
            at: Date.parse(ev.row.created_at),
            text: ev.row.text,
            via: ev.row.via ?? undefined,
          },
        };
      return ev.old ? { kind: "unactivity", id: ev.old.id } : { kind: "none" };
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
    case "order":
      return { kind: "column", status: ev.status, ids: ev.numbers.map((n) => taskKey(ctx.prefix, n)) };
  }
}

export function apply(state: BoardState, c: Change, pending?: BoardState): BoardState {
  switch (c.kind) {
    case "none":
    case "reorder":
      return state;
    case "column": {
      const ids = state.columns[c.status];
      // A reorder you haven't saved yet wins over one from someone else
      if (pending && !sameList(pending.columns[c.status], ids)) return state;
      const here = new Set(ids);
      const order = c.ids.filter((id) => here.has(id));
      const known = new Set(order);
      const column = [...order, ...ids.filter((id) => !known.has(id))];
      return sameList(column, ids) ? state : { ...state, columns: { ...state.columns, [c.status]: column } };
    }
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
        const column = [...(state.columns[c.add.status] ?? [])];
        column.splice(Math.max(0, Math.min(Math.round(c.position), column.length)), 0, c.id);
        return {
          ...state,
          next: Math.max(state.next, taskNumber(c.id) + 1),
          tasks: { ...state.tasks, [c.id]: c.add },
          columns: { ...state.columns, [c.add.status]: column },
        };
      }
      if (!prev || !c.fields) return state;
      const base = pending?.tasks[c.id];
      const patch = Object.fromEntries(
        Object.entries(c.fields).filter(([f]) => !base || same(prev[f as keyof Task], base[f as keyof Task])),
      ) as Partial<Task>;
      if (!Object.keys(patch).length) return state;
      const task = { ...prev, ...patch };
      let columns = state.columns;
      if (patch.status && patch.status !== prev.status) {
        const to = [...(columns[patch.status] ?? [])].filter((x) => x !== c.id);
        to.splice(Math.max(0, Math.min(Math.round(c.position), to.length)), 0, c.id);
        columns = { ...columns, [prev.status]: columns[prev.status].filter((x) => x !== c.id), [patch.status]: to };
      }
      return { ...state, tasks: { ...state.tasks, [c.id]: task }, columns };
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
      return { ...state, tasks: { ...state.tasks, [c.task]: { ...t, thread, comments: thread.length } } };
    }
    case "uncomment": {
      const entry = Object.values(state.tasks).find((t) => t.thread?.some((x) => x.id === c.id));
      if (!entry) return state;
      const thread = entry.thread!.filter((x) => x.id !== c.id);
      return { ...state, tasks: { ...state.tasks, [entry.id]: { ...entry, thread, comments: thread.length } } };
    }
    case "activity": {
      const t = state.tasks[c.task];
      if (!t || t.activity.some((x) => x.id === c.entry.id)) return state;
      const activity = [...t.activity, c.entry].sort((a, b) => a.at - b.at);
      return { ...state, tasks: { ...state.tasks, [c.task]: { ...t, activity } } };
    }
    case "unactivity": {
      const entry = Object.values(state.tasks).find((t) => t.activity.some((x) => x.id === c.id));
      if (!entry) return state;
      return {
        ...state,
        tasks: { ...state.tasks, [entry.id]: { ...entry, activity: entry.activity.filter((x) => x.id !== c.id) } },
      };
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
      return {
        ...state,
        next: Math.max(state.next, c.next ?? 0),
        roadmap: {
          ...state.roadmap,
          public: keepPublic || c.public === undefined ? state.roadmap.public : c.public,
          page: keepPage || !c.page ? state.roadmap.page : c.page,
        },
      };
    }
  }
}

export type Gone = { comments: Set<string>; activity: Set<string>; suggestions: Set<string> };

// Comments, activity and ideas are deleted outright, so the only sign one is gone is a newer copy of the board
// without it. This lists what an older copy had that a newer one doesn't, for tasks both still have
export function goneSince(before: BoardState, after: BoardState): Gone | null {
  const gone: Gone = { comments: new Set(), activity: new Set(), suggestions: new Set() };
  for (const [id, was] of Object.entries(before.tasks)) {
    const now = after.tasks[id];
    if (!now) continue;
    const comments = new Set((now.thread ?? []).map((c) => c.id));
    for (const c of was.thread ?? []) if (!comments.has(c.id)) gone.comments.add(c.id);
    const activity = new Set(now.activity.map((a) => a.id));
    for (const a of was.activity) if (a.id && !activity.has(a.id)) gone.activity.add(a.id);
  }
  const ideas = new Set(after.roadmap.suggestions.map((s) => s.id));
  for (const s of before.roadmap.suggestions) if (!ideas.has(s.id)) gone.suggestions.add(s.id);
  return gone.comments.size || gone.activity.size || gone.suggestions.size ? gone : null;
}

export function dropGone(state: BoardState, gone: Gone): BoardState {
  let tasks = state.tasks;
  for (const [id, t] of Object.entries(state.tasks)) {
    const thread = t.thread?.filter((c) => !gone.comments.has(c.id));
    const activity = t.activity.filter((a) => !a.id || !gone.activity.has(a.id));
    if (thread?.length === t.thread?.length && activity.length === t.activity.length) continue;
    if (tasks === state.tasks) tasks = { ...state.tasks };
    tasks[id] = { ...t, thread, comments: thread?.length ?? t.comments, activity };
  }
  const suggestions = state.roadmap.suggestions.filter((s) => !gone.suggestions.has(s.id));
  if (tasks === state.tasks && suggestions.length === state.roadmap.suggestions.length) return state;
  return { ...state, tasks, roadmap: { ...state.roadmap, suggestions } };
}
