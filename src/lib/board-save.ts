import type { BoardState, StatusCategory, Task } from "./board-store";
import { absorb, diffBoards, emptyDiff, renumber, taskKey, toWire, type Diff } from "./board-sync";

// Saving a board's changes. Everything waiting goes in one request. When the database turns that down, the
// changes go again one task at a time, so the one it won't take is the only one lost and the rest still save.
// Lost connections and server trouble are never a reason to drop anything: those wait and try again

export type Wire = ReturnType<typeof toWire>;
export type SendError = { code?: string; message: string };
export type Send = (changes: Wire) => Promise<{ data: unknown; error: SendError | null }>;

export type Refused = { diff: Diff; what: string; why: string };

export type SaveResult = {
  // What the database now holds
  base: BoardState;
  // New tasks the database numbered differently, as [old key, new key], in the order they happened
  renamed: [string, string][];
  // Changes the database turned down. They are still on screen until revert takes them off
  refused: Refused[];
  // The parts that went through, with the state they were sent from, keyed as they are now
  saved: Diff[];
  goal: BoardState;
  // Nothing more could be sent, for now. What's left goes on the next try
  waiting: boolean;
};

// Errors that are about the change itself: bad data, a broken rule, or no permission to make it. Anything else,
// from a dropped connection to an expired sign-in, is worth trying again
export function refusal(error: SendError) {
  const code = error.code ?? "";
  return code.startsWith("22") || code.startsWith("23") || code === "42501" || code === "P0001";
}

export const blankDiff = (): Diff => ({
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
  roadmapPublic: false,
  page: false,
  suggested: [],
  declined: [],
  suggestionVoted: [],
  suggestionUnvoted: [],
});

/** Splits changes into parts that each make sense alone: one per task, the card order, the page, each idea */
export function splitDiff(d: Diff): Diff[] {
  const tasks = new Set<string>([
    ...d.created,
    ...d.updated.map((u) => u.id),
    ...d.deleted,
    ...d.comments.map((c) => c.task),
    ...d.uncomments.map((c) => c.task),
    ...d.activity.map((a) => a.task),
    ...d.unactivity.map((a) => a.task),
    ...d.voted,
    ...d.unvoted,
  ]);
  const created = new Set(d.created);
  // New tasks first, so whatever else mentions them finds them there
  const order = [...tasks].sort((a, b) => Number(created.has(b)) - Number(created.has(a)));
  const parts: Diff[] = order.map((id) => ({
    ...blankDiff(),
    created: d.created.filter((x) => x === id),
    updated: d.updated.filter((u) => u.id === id),
    deleted: d.deleted.filter((x) => x === id),
    comments: d.comments.filter((c) => c.task === id),
    uncomments: d.uncomments.filter((c) => c.task === id),
    activity: d.activity.filter((a) => a.task === id),
    unactivity: d.unactivity.filter((a) => a.task === id),
    voted: d.voted.filter((x) => x === id),
    unvoted: d.unvoted.filter((x) => x === id),
  }));
  if (d.columns.length) parts.push({ ...blankDiff(), columns: d.columns });
  if (d.roadmapPublic || d.page) parts.push({ ...blankDiff(), roadmapPublic: d.roadmapPublic, page: d.page });
  for (const id of d.suggested)
    parts.push({ ...blankDiff(), suggested: [id], suggestionVoted: d.suggestionVoted.filter((x) => x === id) });
  for (const id of d.declined) parts.push({ ...blankDiff(), declined: [id] });
  const loose = (id: string) => !d.suggested.includes(id);
  if (d.suggestionVoted.some(loose) || d.suggestionUnvoted.length)
    parts.push({
      ...blankDiff(),
      suggestionVoted: d.suggestionVoted.filter(loose),
      suggestionUnvoted: d.suggestionUnvoted,
    });
  return parts;
}

/** The same changes, with a task's old key swapped for its new one */
export function renameDiff(d: Diff, from: string, to: string): Diff {
  const r = (id: string) => (id === from ? to : id);
  return {
    ...d,
    created: d.created.map(r),
    updated: d.updated.map((u) => ({ ...u, id: r(u.id) })),
    deleted: d.deleted.map(r),
    comments: d.comments.map((c) => ({ ...c, task: r(c.task) })),
    uncomments: d.uncomments.map((c) => ({ ...c, task: r(c.task) })),
    activity: d.activity.map((a) => ({ ...a, task: r(a.task) })),
    unactivity: d.unactivity.map((a) => ({ ...a, task: r(a.task) })),
    voted: d.voted.map(r),
    unvoted: d.unvoted.map(r),
  };
}

/** A few words on what a part of the changes was, for when it doesn't save */
export function describeDiff(d: Diff, state: BoardState): string {
  const title = (id: string) => {
    const t = state.tasks[id];
    return t ? `${id} · ${t.title}` : id;
  };
  if (d.created.length) return `New task ${title(d.created[0])}`;
  if (d.deleted.length) return `Deleting ${d.deleted[0]}`;
  const task =
    d.updated[0]?.id ??
    d.comments[0]?.task ??
    d.uncomments[0]?.task ??
    d.activity[0]?.task ??
    d.unactivity[0]?.task ??
    d.voted[0] ??
    d.unvoted[0];
  if (task) {
    if (d.comments.length) return `Your comment on ${task}`;
    return `Changes to ${title(task)}`;
  }
  if (d.columns.length) return "The order of the cards";
  if (d.roadmapPublic || d.page) return "The public roadmap settings";
  if (d.suggested.length || d.declined.length) return "An idea on the roadmap";
  return "A vote on an idea";
}

const why = (error: SendError) =>
  error.code === "42501"
    ? "You don’t have permission to make this change."
    : error.code?.startsWith("23") || error.code?.startsWith("22")
      ? "The database didn’t accept it."
      : error.message;

/** Sends what changed between `base` and `target`. Never throws: problems come back in the result */
export async function saveChanges(base: BoardState, target: BoardState, send: Send, prefix: string): Promise<SaveResult> {
  const result: SaveResult = { base, renamed: [], refused: [], saved: [], goal: target, waiting: false };
  const all = diffBoards(base, target);
  if (emptyDiff(all)) return result;

  let goal = target;
  let pending: Diff[] = [];
  const settle = (d: Diff, data: unknown) => {
    let next = absorb(result.base, goal, d);
    result.saved.push(d);
    const reply = (data ?? {}) as { moved?: Record<string, number>; next?: number };
    for (const [from, to] of Object.entries(reply.moved ?? {})) {
      const a = taskKey(prefix, Number(from));
      const b = taskKey(prefix, to);
      if (a === b) continue;
      next = renumber(next, a, b);
      goal = renumber(goal, a, b);
      result.renamed.push([a, b]);
      pending = pending.map((p) => renameDiff(p, a, b));
      result.saved = result.saved.map((p) => renameDiff(p, a, b));
      result.refused = result.refused.map((r) => ({ ...r, diff: renameDiff(r.diff, a, b) }));
    }
    result.base = { ...next, next: Math.max(next.next, reply.next ?? 0) };
    result.goal = goal;
  };

  const first = await attempt(send, toWire(all, goal));
  if (!first.error) {
    settle(all, first.data);
    return result;
  }
  if (!refusal(first.error)) return { ...result, waiting: true };

  pending = splitDiff(all);
  while (pending.length) {
    const [part, ...rest] = pending;
    pending = rest;
    const { data, error } = await attempt(send, toWire(part, goal));
    if (!error) settle(part, data);
    else if (refusal(error)) result.refused.push({ diff: part, what: describeDiff(part, goal), why: why(error) });
    else {
      result.waiting = true;
      break;
    }
  }
  return result;
}

async function attempt(send: Send, changes: Wire) {
  try {
    return await send(changes);
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Network error" } };
  }
}

/** Takes changes the database refused back off the board on screen, so it shows what's saved again */
export function revert(ui: BoardState, base: BoardState, d: Diff): BoardState {
  const tasks: Record<string, Task> = { ...ui.tasks };
  const columns = { ...ui.columns };
  const statuses = Object.keys(columns) as StatusCategory[];
  const lift = (id: string) => {
    for (const s of statuses) if (columns[s].includes(id)) columns[s] = columns[s].filter((x) => x !== id);
  };
  const putBack = (id: string) => {
    const t = tasks[id];
    if (!t) return;
    lift(id);
    const column = [...columns[t.status]];
    const at = base.columns[t.status]?.indexOf(id) ?? -1;
    column.splice(at < 0 ? column.length : Math.min(at, column.length), 0, id);
    columns[t.status] = column;
  };

  for (const id of d.created) {
    delete tasks[id];
    lift(id);
  }
  for (const id of d.deleted)
    if (base.tasks[id]) {
      tasks[id] = base.tasks[id];
      putBack(id);
    }
  for (const { id, fields } of d.updated) {
    const now = tasks[id];
    const was = base.tasks[id];
    if (!now || !was) continue;
    const next: Record<string, unknown> = { ...now };
    for (const f of fields) next[f] = was[f];
    tasks[id] = next as Task;
    if (fields.includes("status")) putBack(id);
  }
  for (const id of [...d.voted, ...d.unvoted]) {
    const now = tasks[id];
    const was = base.tasks[id];
    if (now && was) tasks[id] = { ...now, voted: was.voted, votes: was.votes };
  }
  const threads = new Set([...d.comments, ...d.uncomments].map((c) => c.task));
  for (const id of threads) {
    const now = tasks[id];
    if (!now) continue;
    const added = new Set(d.comments.filter((c) => c.task === id).map((c) => c.comment.id));
    const removed = new Set(d.uncomments.filter((c) => c.task === id).map((c) => c.id));
    const back = (base.tasks[id]?.thread ?? []).filter((c) => removed.has(c.id));
    const thread = [...(now.thread ?? []).filter((c) => !added.has(c.id)), ...back].sort((a, b) => a.at - b.at);
    tasks[id] = { ...now, thread, comments: thread.length };
  }
  const logs = new Set([...d.activity, ...d.unactivity].map((a) => a.task));
  for (const id of logs) {
    const now = tasks[id];
    if (!now) continue;
    const added = new Set(d.activity.filter((a) => a.task === id).map((a) => a.entry.id));
    const removed = new Set(d.unactivity.filter((a) => a.task === id).map((a) => a.id));
    const back = (base.tasks[id]?.activity ?? []).filter((a) => a.id && removed.has(a.id));
    const activity = [...now.activity.filter((a) => !a.id || !added.has(a.id)), ...back].sort((a, b) => a.at - b.at);
    tasks[id] = { ...now, activity };
  }
  for (const s of d.columns) {
    const saved = (base.columns[s] ?? []).filter((id) => tasks[id]?.status === s);
    const known = new Set(saved);
    columns[s] = [...saved, ...columns[s].filter((id) => !known.has(id) && tasks[id]?.status === s)];
  }

  let suggestions = ui.roadmap.suggestions.filter((s) => !d.suggested.includes(s.id));
  for (const id of d.declined) {
    const was = base.roadmap.suggestions.find((s) => s.id === id);
    if (was && !suggestions.some((s) => s.id === id)) suggestions = [was, ...suggestions];
  }
  const votes = new Set([...d.suggestionVoted, ...d.suggestionUnvoted]);
  suggestions = suggestions.map((s) => {
    if (!votes.has(s.id)) return s;
    const was = base.roadmap.suggestions.find((x) => x.id === s.id);
    return was ? { ...s, voted: was.voted, votes: was.votes } : s;
  });

  return {
    ...ui,
    tasks,
    columns,
    roadmap: {
      public: d.roadmapPublic ? base.roadmap.public : ui.roadmap.public,
      page: d.page ? base.roadmap.page : ui.roadmap.page,
      suggestions,
    },
  };
}
