import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pageFrom,
  type Activity,
  type BoardState,
  type Comment,
  type CustomField,
  type Label,
  type Project,
  type StatusCategory,
  type StatusNames,
  type Task,
} from "./board-store";
import { activityFrom, commentFrom, fromRow, taskKey, type SuggestionRow, type TaskRow } from "./board-sync";
import type { LiveBoard, LiveFrame } from "./live";

// Reading a board, shared by the server (first page load) and the browser (boards it reads itself)
//
// A board comes with each task's comment count and latest activity line, not its comments and activity, which can
// be most of a board's size. Its Inbox gets the board's latest lines by other people. The rest of a task's thread
// is read when its dialog opens (readThread)

const statusKeys: StatusCategory[] = ["backlog", "todo", "in_progress", "review", "done", "canceled"];

type Line = { id: string; actor: string | null; text: string; created_at: string; via: string | null };
// A line of activity with the task it's on
export type BoardLine = Line & { number: number };

type NestedTask = TaskRow & {
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

// The board's own columns are read whole, so ones a migration adds later don't stop it loading before then
export const boardColumns =
  "*, " +
  "tasks(*, comments(count), activity(id, actor, text, created_at, via), task_votes(voter)), " +
  "suggestions(*, suggestion_votes(voter))";

// One request for a board and its tasks, with each task's latest activity line. The votes come back only when they
// are the viewer's own
export function boardQuery(supabase: SupabaseClient, meId: string, select = boardColumns) {
  return supabase
    .from("boards")
    .select(select)
    .is("tasks.deleted_at", null)
    .order("position", { referencedTable: "tasks" })
    .order("number", { referencedTable: "tasks" })
    .order("created_at", { referencedTable: "tasks.activity", ascending: false })
    .limit(1, { referencedTable: "tasks.activity" })
    .eq("tasks.task_votes.voter", `u:${meId}`)
    .order("vote_count", { referencedTable: "suggestions", ascending: false })
    .eq("suggestions.suggestion_votes.voter", `u:${meId}`);
}

// The Inbox shows the 12 newest lines by other people. A few more are read, as it tells people apart by name
const RECENT = 20;

/** The board's newest activity by anyone but you, on tasks still on the board, for its Inbox */
export async function recentLines(supabase: SupabaseClient, boardId: string, meId: string): Promise<BoardLine[]> {
  const { data } = await supabase
    .from("activity")
    .select("id, number, actor, text, created_at, via, tasks!inner(deleted_at)")
    .eq("board_id", boardId)
    .is("tasks.deleted_at", null)
    // Lines of someone who has since left keep no actor, and still count as someone else's
    .or(`actor.is.null,actor.neq.${meId}`)
    .order("created_at", { ascending: false })
    .limit(RECENT);
  return ((data ?? []) as unknown as BoardLine[]).map((a) => ({
    id: a.id,
    number: a.number,
    actor: a.actor,
    text: a.text,
    created_at: a.created_at,
    via: a.via,
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

type Fetched = { board: NestedBoard; recent: BoardLine[]; at: number };

/** A board as the browser reads it, by id. Null when it can't be seen */
export async function fetchBoard(supabase: SupabaseClient, meId: string, boardId: string): Promise<Fetched | null> {
  const at = Date.now();
  const [{ data, error }, recent] = await Promise.all([
    boardQuery(supabase, meId).eq("id", boardId).maybeSingle(),
    recentLines(supabase, boardId, meId),
  ]);
  if (error) throw new Error(error.message);
  return data ? { board: data as unknown as NestedBoard, recent, at } : null;
}

/** A board read in the browser, around the workspace the page already has */
export function liveFrom(frame: Omit<LiveFrame, "board">, { board, recent, at }: Fetched): LiveBoard {
  const names = new Map(frame.members.map((m) => [m.id, m.name]));
  const state = boardState(board, (id) => (id && names.get(id)) || "Former member", recent);
  return { ...frame, board: boardInfo(board), state, at };
}

export async function readLive(supabase: SupabaseClient, frame: Omit<LiveFrame, "board">, boardId: string) {
  const fetched = await fetchBoard(supabase, frame.me.id, boardId);
  return fetched ? liveFrom(frame, fetched) : null;
}

/** Turns a board as read into what the app holds. recent is the board's newest lines by other people */
export function boardState(board: NestedBoard, nameOf: (id: string | null) => string, recent: BoardLine[] = []): BoardState {
  const map: Record<string, Task> = {};
  const columns = Object.fromEntries(statusKeys.map((s) => [s, [] as string[]])) as BoardState["columns"];
  const lines = new Map<number, BoardLine[]>();
  for (const l of recent) lines.set(l.number, [...(lines.get(l.number) ?? []), l]);

  for (const row of board.tasks) {
    const key = taskKey(board.prefix, row.number);
    const known = new Map<string, Line>();
    for (const a of [...row.activity, ...(lines.get(row.number) ?? [])]) known.set(a.id, a);
    map[key] = {
      id: key,
      ...fromRow(row),
      origin: row.origin ?? undefined,
      voted: row.task_votes.length > 0,
      comments: row.comments[0]?.count ?? 0,
      thread: [],
      activity: [...known.values()].map((a) => activityFrom(a, nameOf)).sort((a, b) => a.at - b.at),
      partial: true,
    };
    (columns[row.status] ??= []).push(key);
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
