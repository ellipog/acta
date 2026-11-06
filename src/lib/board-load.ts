import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emptyColumns,
  mergeIds,
  pageFrom,
  type Activity,
  type BoardState,
  type Comment,
  type CustomField,
  type Label,
  type Project,
  type StatusNames,
  type Task,
} from "./board-store";
import { gapsFrom, shelfOf, type Place, type Shelf, type ShelfCounts } from "./board-shelves";
import { activityFrom, commentFrom, fromRow, taskKey, type SuggestionRow, type TaskRow } from "./board-sync";
import type { LiveBoard, LiveFrame } from "./live";

// Reading a board, shared by the server (first page load) and the browser (boards it reads itself)
//
// A board comes as the first page of each shelf its view shows (see board-shelves.ts), with every shelf's count, and
// the browser reads the rest of those shelves straight after. Shelves the view doesn't show wait on the server.
//
// Each task comes with its comment count and latest activity line, not its comments and activity, which can be most
// of a board's size. Its Inbox gets the board's latest lines by other people, with the tasks they're on. The rest of
// a task's thread is read when its dialog opens (readThread)

// How many tasks of each shelf come with the board, enough to fill a column or a screen of rows and some way past
export const FIRST = 100;
// How many each read after that brings
export const PAGE = 500;

type Line = { id: string; actor: string | null; text: string; created_at: string; via: string | null };
// A line of activity with the task it's on, and the task itself when the line came with it
export type BoardLine = Line & { number: number; task?: NestedTask };

export type NestedTask = TaskRow & {
  comments: { count: number }[];
  activity: Line[];
  task_votes: { voter: string }[];
};

export type NestedBoard = {
  id: string;
  slug: string;
  name: string;
  prefix: string;
  next_number: number;
  labels: Label[] | null;
  projects: Project[] | null;
  // Missing until the custom fields migration runs
  fields?: CustomField[] | null;
  status_names?: StatusNames | null;
  // Missing until the board icons migration runs
  icon?: string;
  roadmap_public: boolean;
  page: object;
  tasks: NestedTask[];
  suggestions: (SuggestionRow & { suggestion_votes: { voter: string }[] })[];
};

// What a board's first read held of its shelves: how many tasks of each it read in board order, out of how many it
// asked for, the last of them, and every shelf's count. Without one, a board holds all its tasks
export type FirstRead = {
  counts: ShelfCounts | null;
  read: Partial<Record<Shelf, number>>;
  through: Partial<Record<Shelf, Place>>;
  limit: number;
};

// A task with its comment count, its latest activity line and whether you voted for it
const taskColumns = "*, comments(count), activity(id, actor, text, created_at, via), task_votes(voter)";
const headOf = (s: Shelf) => `shelf_${s}`;

type Filtering<Q> = {
  is(column: string, value: null): Q;
  eq(column: string, value: string): Q;
  not(column: string, operator: string, value: null): Q;
};

/** Keeps a read of tasks to one shelf. at names an embed of the tasks, as "shelf_done." */
function onShelf<Q extends Filtering<Q>>(query: Q, shelf: Shelf, at = ""): Q {
  const q = query.is(`${at}deleted_at`, null);
  return shelf === "archived"
    ? q.not(`${at}archived_at`, "is", null)
    : q.eq(`${at}status`, shelf).is(`${at}archived_at`, null);
}

// The board's own columns are read whole, so ones a migration adds later don't stop it loading before then
const boardColumns = (shelves: Shelf[]) =>
  ["*", ...shelves.map((s) => `${headOf(s)}:tasks(${taskColumns})`), "suggestions(*, suggestion_votes(voter))"].join(
    ", ",
  );

/** One request for a board and the first page of each of these shelves, in board order. The votes come back only
 * when they are the viewer's own */
export function boardQuery(supabase: SupabaseClient, meId: string, shelves: Shelf[], extra = "") {
  let query = supabase.from("boards").select(boardColumns(shelves) + extra);
  for (const s of shelves) {
    const at = headOf(s);
    query = onShelf(query, s, `${at}.`)
      .order("position", { referencedTable: at })
      .order("number", { referencedTable: at })
      .limit(FIRST, { referencedTable: at })
      .order("created_at", { referencedTable: `${at}.activity`, ascending: false })
      .limit(1, { referencedTable: `${at}.activity` })
      .eq(`${at}.task_votes.voter`, `u:${meId}`);
  }
  return query
    .order("vote_count", { referencedTable: "suggestions", ascending: false })
    .eq("suggestions.suggestion_votes.voter", `u:${meId}`);
}

const placeOf = (row: TaskRow): Place => ({ position: row.position, number: row.number });

/** A board as boardQuery reads it, its shelves' tasks gathered into one list, with what the read held of each */
export function firstRead(raw: Record<string, unknown>, shelves: Shelf[], counts: ShelfCounts | null) {
  const tasks: NestedTask[] = [];
  const read: FirstRead["read"] = {};
  const through: FirstRead["through"] = {};
  for (const s of shelves) {
    const rows = (raw[headOf(s)] ?? []) as NestedTask[];
    read[s] = rows.length;
    if (rows.length) through[s] = placeOf(rows[rows.length - 1]);
    tasks.push(...rows);
  }
  const board = { ...raw, tasks } as unknown as NestedBoard;
  return { board, first: { counts, read, through, limit: FIRST } satisfies FirstRead };
}

/** How many tasks each shelf has on the server, and the last position on each. Null when they couldn't be counted,
 * as before the shelves migration runs, which makes the board read every shelf */
export async function countShelves(supabase: SupabaseClient, boardId: string): Promise<ShelfCounts | null> {
  const { data, error } = await supabase.rpc("board_shelves", { p_board: boardId });
  return error ? null : ((data ?? {}) as ShelfCounts);
}

/** The next page of a shelf in board order, after a place on it. Null when it couldn't be read */
export async function readShelf(
  supabase: SupabaseClient,
  boardId: string,
  meId: string,
  shelf: Shelf,
  after: Place | undefined,
  limit = PAGE,
): Promise<NestedTask[] | null> {
  let query = onShelf(supabase.from("tasks").select(taskColumns).eq("board_id", boardId), shelf);
  if (after)
    query = query.or(
      `position.gt.${after.position},and(position.eq.${after.position},number.gt.${after.number})`,
    );
  const { data, error } = await query
    .order("position")
    .order("number")
    .order("created_at", { referencedTable: "activity", ascending: false })
    .limit(1, { referencedTable: "activity" })
    .eq("task_votes.voter", `u:${meId}`)
    .limit(limit);
  return error ? null : ((data ?? []) as unknown as NestedTask[]);
}

/** Some of a board's tasks by number, whatever shelf they're on. Null when they couldn't be read */
export async function readTasks(
  supabase: SupabaseClient,
  boardId: string,
  meId: string,
  numbers: number[],
): Promise<NestedTask[] | null> {
  if (!numbers.length) return [];
  const { data, error } = await supabase
    .from("tasks")
    .select(taskColumns)
    .eq("board_id", boardId)
    .is("deleted_at", null)
    .in("number", numbers)
    .order("created_at", { referencedTable: "activity", ascending: false })
    .limit(1, { referencedTable: "activity" })
    .eq("task_votes.voter", `u:${meId}`);
  return error ? null : ((data ?? []) as unknown as NestedTask[]);
}

// The Inbox shows the 12 newest lines by other people. A few more are read, as it tells people apart by name
const RECENT = 20;

/** The board's newest activity by anyone but you, on tasks still on the board, for its Inbox. Each line brings its
 * task, as the board may not have read the shelf it's on */
export async function recentLines(supabase: SupabaseClient, boardId: string, meId: string): Promise<BoardLine[]> {
  const { data } = await supabase
    .from("activity")
    .select(`id, number, actor, text, created_at, via, tasks!inner(${taskColumns})`)
    .eq("board_id", boardId)
    .is("tasks.deleted_at", null)
    // Lines of someone who has since left keep no actor, and still count as someone else's
    .or(`actor.is.null,actor.neq.${meId}`)
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "tasks.activity", ascending: false })
    .limit(1, { referencedTable: "tasks.activity" })
    .eq("tasks.task_votes.voter", `u:${meId}`)
    .limit(RECENT);
  return ((data ?? []) as unknown as (BoardLine & { tasks: NestedTask | null })[]).map((a) => ({
    id: a.id,
    number: a.number,
    actor: a.actor,
    text: a.text,
    created_at: a.created_at,
    via: a.via,
    task: a.tasks ?? undefined,
  }));
}

// How many activity lines a task's dialog shows at most
export const THREAD_ACTIVITY = 100;

/** A task's whole thread and newest activity, for its dialog. Null when it couldn't be read */
export async function readThread(
  supabase: SupabaseClient,
  boardId: string,
  number: number,
  nameOf: (id: string | null) => string,
): Promise<{ comments: Comment[]; activity: Activity[]; complete: boolean } | null> {
  const [comments, activity] = await Promise.all([
    supabase.from("comments").select("*").eq("board_id", boardId).eq("number", number).order("created_at"),
    supabase
      .from("activity")
      .select("id, actor, text, created_at, via")
      .eq("board_id", boardId)
      .eq("number", number)
      .order("created_at", { ascending: false })
      .limit(THREAD_ACTIVITY),
  ]);
  if (comments.error || activity.error) return null;
  const lines = (activity.data ?? []) as Line[];
  return {
    comments: ((comments.data ?? []) as Parameters<typeof commentFrom>[0][]).map((c) => commentFrom(c, nameOf)),
    activity: lines.map((a) => activityFrom(a, nameOf)).reverse(),
    complete: lines.length < THREAD_ACTIVITY,
  };
}

/** Comment counts and latest activity lines of some of a board's tasks, or of all of them. Null when they couldn't
 * be read */
export async function readCounts(supabase: SupabaseClient, boardId: string, numbers?: number[]) {
  let query = supabase
    .from("tasks")
    .select("number, comments(count), activity(id, actor, text, created_at, via)")
    .eq("board_id", boardId)
    .is("deleted_at", null)
    .order("created_at", { referencedTable: "activity", ascending: false })
    .limit(1, { referencedTable: "activity" });
  if (numbers) query = query.in("number", numbers);
  const { data, error } = await query;
  if (error) return null;
  return (data ?? []) as unknown as { number: number; comments: { count: number }[]; activity: Line[] }[];
}

/** What a page shows of the board itself, from its row */
export function boardInfo(row: Omit<NestedBoard, "tasks" | "suggestions">): LiveBoard["board"] {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    prefix: row.prefix,
    labels: row.labels ?? [],
    projects: row.projects ?? [],
    fields: row.fields ?? [],
    statusNames: row.status_names ?? {},
    icon: row.icon,
  };
}

type Fetched = { board: NestedBoard; first: FirstRead; recent: BoardLine[]; at: number };

/** A board as the browser reads it, by id, with the first page of the shelves its view shows. Null when it can't be
 * seen */
export async function fetchBoard(
  supabase: SupabaseClient,
  meId: string,
  boardId: string,
  shelves: Shelf[],
): Promise<Fetched | null> {
  const at = Date.now();
  const [{ data, error }, counts, recent] = await Promise.all([
    boardQuery(supabase, meId, shelves).eq("id", boardId).maybeSingle(),
    countShelves(supabase, boardId),
    recentLines(supabase, boardId, meId),
  ]);
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { board, first } = firstRead(data as unknown as Record<string, unknown>, shelves, counts);
  return { board, first, recent, at };
}

/** A board read in the browser, around the workspace the page already has */
export function liveFrom(frame: Omit<LiveFrame, "board">, { board, first, recent, at }: Fetched): LiveBoard {
  const names = new Map(frame.members.map((m) => [m.id, m.name]));
  const state = boardState(board, (id) => (id && names.get(id)) || "Former member", recent, first);
  return { ...frame, board: boardInfo(board), state, at };
}

export async function readLive(
  supabase: SupabaseClient,
  frame: Omit<LiveFrame, "board">,
  boardId: string,
  shelves: Shelf[],
) {
  const fetched = await fetchBoard(supabase, frame.me.id, boardId, shelves);
  return fetched ? liveFrom(frame, fetched) : null;
}

/** A task as the app holds it, from its row as a board read brings it. lines are more of its activity, like the
 * Inbox's */
export function taskFrom(prefix: string, row: NestedTask, nameOf: (id: string | null) => string, lines: Line[] = []): Task {
  const known = new Map<string, Line>();
  for (const a of [...(row.activity ?? []), ...lines]) known.set(a.id, a);
  return {
    id: taskKey(prefix, row.number),
    ...fromRow(row),
    origin: row.origin ?? undefined,
    voted: (row.task_votes ?? []).length > 0,
    comments: row.comments?.[0]?.count ?? 0,
    thread: [],
    activity: [...known.values()].map((a) => activityFrom(a, nameOf)).sort((a, b) => a.at - b.at),
    partial: true,
  };
}

/** Turns a board as read into what the app holds. recent is the board's newest lines by other people, with their
 * tasks. first says what the read held of each shelf, without which the board holds every task */
export function boardState(
  board: NestedBoard,
  nameOf: (id: string | null) => string,
  recent: BoardLine[] = [],
  first?: FirstRead,
): BoardState {
  const map: Record<string, Task> = {};
  const columns = emptyColumns();
  const lines = new Map<number, BoardLine[]>();
  for (const l of recent) lines.set(l.number, [...(lines.get(l.number) ?? []), l]);

  // Each shelf comes in board order, so its tasks go straight into their column. Archived ones come on a shelf of
  // their own, across every status, and the Inbox's tasks wherever they are, so those are merged in by position
  const extra = new Map<Task["status"], string[]>();
  const later = (status: Task["status"], key: string) => extra.set(status, [...(extra.get(status) ?? []), key]);
  for (const row of board.tasks) {
    const key = taskKey(board.prefix, row.number);
    if (map[key]) continue;
    map[key] = taskFrom(board.prefix, row, nameOf, lines.get(row.number));
    if (row.archived_at) later(row.status, key);
    else (columns[row.status] ??= []).push(key);
  }
  // The Inbox's tasks where the board didn't read their shelf, which wait out of sight until it does
  for (const l of recent) {
    const key = taskKey(board.prefix, l.number);
    if (!l.task || map[key]) continue;
    map[key] = taskFrom(board.prefix, l.task, nameOf, lines.get(l.number));
    later(l.task.status, key);
  }
  for (const [s, ids] of extra) columns[s] = mergeIds(columns[s] ?? [], map, ids);

  let gaps: BoardState["gaps"];
  if (first) {
    const held: Partial<Record<Shelf, number>> = {};
    for (const t of Object.values(map)) held[shelfOf(t)] = (held[shelfOf(t)] ?? 0) + 1;
    gaps = gapsFrom({ ...first, held });
  }

  return {
    next: board.next_number,
    tasks: map,
    columns,
    roadmap: {
      public: board.roadmap_public,
      suggestions: board.suggestions.map((s) => ({
        id: s.id,
        title: s.title,
        details: s.details ?? undefined,
        by: s.by_name,
        at: Date.parse(s.created_at),
        votes: s.vote_count,
        voted: s.suggestion_votes.length > 0,
      })),
      page: pageFrom(board.name, board.slug, board.page),
    },
    ...(gaps ? { gaps } : {}),
  };
}

// Tasks on each board, for the counts beside board names, by board ids or by the workspace's address. Archived
// tasks are left out. With `mine`, only that person's open tasks count, for My tasks. A failure leaves the counts
// out rather than the boards
export async function countTasks(
  supabase: SupabaseClient,
  where: { ids: string[] } | { workspace: string },
  mine?: string,
) {
  if ("ids" in where && !where.ids.length) return {};
  const read = (archive: boolean) => {
    let query = (
      "ids" in where
        ? supabase.from("boards").select("id, tasks(count)").in("id", where.ids)
        : supabase.from("boards").select("id, tasks(count), workspaces!inner(slug)").eq("workspaces.slug", where.workspace)
    ).is("tasks.deleted_at", null);
    if (mine) query = query.eq("tasks.assignee", mine).not("tasks.status", "in", "(done,canceled)");
    return archive ? query.is("tasks.archived_at", null) : query;
  };
  let { data, error } = await read(true);
  // Before the archive migration there's no archived_at to leave out
  if (error) ({ data, error } = await read(false));
  if (error || !data) return {};
  return Object.fromEntries(
    data.map((b) => [b.id as string, (b.tasks as unknown as { count: number }[] | null)?.[0]?.count ?? 0]),
  ) as Record<string, number>;
}
