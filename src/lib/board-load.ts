import type { SupabaseClient } from "@supabase/supabase-js";
import { pageFrom, type BoardState, type Label, type Project, type StatusCategory, type Task } from "./board-store";
import { fromRow, taskKey, type SuggestionRow, type TaskRow } from "./board-sync";

// Reading a board, shared by the server (first page load) and the browser (boards it fetches ahead of a click)

const statusKeys: StatusCategory[] = ["backlog", "todo", "in_progress", "review", "done", "canceled"];

type NestedTask = TaskRow & {
  comments: {
    id: string;
    author: string | null;
    body: string;
    created_at: string;
    via: string | null;
    author_name?: string | null;
  }[];
  activity: { id: string; actor: string | null; text: string; created_at: string; via: string | null }[];
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
  roadmap_public: boolean;
  page: object;
  tasks: NestedTask[];
  suggestions: (SuggestionRow & { suggestion_votes: { voter: string }[] })[];
};

export const boardColumns =
  "id, slug, name, prefix, next_number, labels, projects, roadmap_public, page, " +
  "tasks(*, comments(*), activity(id, actor, text, created_at, via), task_votes(voter)), " +
  "suggestions(*, suggestion_votes(voter))";

// One request for a board and everything on it. The votes come back only when they are the viewer's own
export function boardQuery(supabase: SupabaseClient, meId: string, select = boardColumns) {
  return supabase
    .from("boards")
    .select(select)
    .is("tasks.deleted_at", null)
    .order("position", { referencedTable: "tasks" })
    .order("number", { referencedTable: "tasks" })
    .order("created_at", { referencedTable: "tasks.comments" })
    .order("created_at", { referencedTable: "tasks.activity", ascending: false })
    .limit(100, { referencedTable: "tasks.activity" })
    .eq("tasks.task_votes.voter", `u:${meId}`)
    .order("vote_count", { referencedTable: "suggestions", ascending: false })
    .eq("suggestions.suggestion_votes.voter", `u:${meId}`);
}

export function boardState(board: NestedBoard, nameOf: (id: string | null) => string): BoardState {
  const map: Record<string, Task> = {};
  const columns = Object.fromEntries(statusKeys.map((s) => [s, [] as string[]])) as BoardState["columns"];

  for (const row of board.tasks) {
    const key = taskKey(board.prefix, row.number);
    const thread = row.comments.map((c) => ({
      id: c.id,
      who: nameOf(c.author),
      at: Date.parse(c.created_at),
      body: c.body,
      via: c.via ?? undefined,
      from: c.author_name ?? undefined,
    }));
    map[key] = {
      id: key,
      ...fromRow(row),
      origin: row.origin ?? undefined,
      voted: row.task_votes.length > 0,
      comments: thread.length,
      thread,
      activity: row.activity
        .map((a) => ({ id: a.id, who: nameOf(a.actor), at: Date.parse(a.created_at), text: a.text, via: a.via ?? undefined }))
        .reverse(),
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
// tasks are left out. A failure leaves the counts out rather than the boards
export async function countTasks(supabase: SupabaseClient, where: { ids: string[] } | { workspace: string }) {
  if ("ids" in where && !where.ids.length) return {};
  const read = (archive: boolean) => {
    const query = (
      "ids" in where
        ? supabase.from("boards").select("id, tasks(count)").in("id", where.ids)
        : supabase.from("boards").select("id, tasks(count), workspaces!inner(slug)").eq("workspaces.slug", where.workspace)
    ).is("tasks.deleted_at", null);
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
