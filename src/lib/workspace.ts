import "server-only";
import { cache } from "react";
import { pageFrom, type BoardState, type Label, type Project, type StatusCategory, type Task } from "./board-store";
import { fromRow, taskKey, type SuggestionRow, type TaskRow } from "./board-sync";
import type { DitherName } from "./dither-assets";
import {
  toneFor,
  type BoardSummary,
  type LiveBoard,
  type Me,
  type Member,
  type Role,
  type WorkspaceSummary,
} from "./live";
import { createClient } from "./supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

type WorkspaceRow = { id: string; slug: string; name: string; sigil: string; tone: string };

const summary = (w: WorkspaceRow, role: Role): WorkspaceSummary => ({
  id: w.id,
  slug: w.slug,
  name: w.name,
  sigil: w.sigil as DitherName,
  tone: w.tone as WorkspaceSummary["tone"],
  role,
});

// The token is checked against the project's signing keys locally, so this costs no round trip
export const getAuth = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { supabase, id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
});

export const getSession = cache(async () => {
  const auth = await getAuth();
  if (!auth) return null;
  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("name, avatar_url")
    .eq("id", auth.id)
    .maybeSingle();
  const me: Me = {
    id: auth.id,
    name: profile?.name || auth.email.split("@")[0] || "You",
    email: auth.email,
    avatar: profile?.avatar_url ?? null,
  };
  return { supabase: auth.supabase, me };
});

export const getWorkspaces = cache(async (): Promise<WorkspaceSummary[]> => {
  const auth = await getAuth();
  if (!auth) return [];
  const { data } = await auth.supabase
    .from("members")
    .select("role, created_at, workspaces (id, slug, name, sigil, tone)")
    .eq("user_id", auth.id)
    .order("created_at");
  return (data ?? [])
    .filter((m) => m.workspaces)
    .map((m) => summary(m.workspaces as unknown as WorkspaceRow, m.role as Role));
});

// Looked up by the workspace's address so these don't wait for the workspace list
const getContents = cache(async (slug: string) => {
  const auth = await getAuth();
  if (!auth) return null;
  const [{ data: boards }, { data: members }] = await Promise.all([
    auth.supabase
      .from("boards")
      .select("id, slug, name, workspaces!inner(slug)")
      .eq("workspaces.slug", slug)
      .order("position")
      .order("created_at"),
    auth.supabase
      .from("members")
      .select("user_id, role, created_at, profiles (name, avatar_url), workspaces!inner(slug)")
      .eq("workspaces.slug", slug)
      .order("created_at"),
  ]);
  const people: Member[] = (members ?? []).map((m) => {
    const p = m.profiles as unknown as { name: string | null; avatar_url: string | null } | null;
    return {
      id: m.user_id,
      name: p?.name || "Member",
      avatar: p?.avatar_url ?? null,
      role: m.role as Role,
      tone: toneFor(m.user_id),
      joined: m.created_at,
    };
  });
  return {
    boards: (boards ?? []).map((b): BoardSummary => ({ id: b.id, slug: b.slug, name: b.name })),
    members: people,
  };
});

export const getWorkspace = cache(async (slug: string) => {
  const [session, workspaces, contents] = await Promise.all([getSession(), getWorkspaces(), getContents(slug)]);
  if (!session || !contents) return null;
  const workspace = workspaces.find((w) => w.slug === slug);
  if (!workspace) return null;
  return { me: session.me, workspace, workspaces, boards: contents.boards, members: contents.members };
});

const statusKeys: StatusCategory[] = ["backlog", "todo", "in_progress", "review", "done"];

type NestedTask = TaskRow & {
  comments: { id: string; author: string | null; body: string; created_at: string }[];
  activity: { id: string; actor: string | null; text: string; created_at: string }[];
  task_votes: { voter: string }[];
};

type NestedBoard = {
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

const boardColumns =
  "id, slug, name, prefix, next_number, labels, projects, roadmap_public, page, " +
  "tasks(*, comments(id, author, body, created_at), activity(id, actor, text, created_at), task_votes(voter)), " +
  "suggestions(*, suggestion_votes(voter))";

// One request for a board and everything on it. The votes come back only when they are the viewer's own
export function boardQuery(supabase: Client, meId: string, select = boardColumns) {
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
    const thread = row.comments.map((c) => ({ id: c.id, who: nameOf(c.author), at: Date.parse(c.created_at), body: c.body }));
    map[key] = {
      id: key,
      ...fromRow(row),
      origin: row.origin ?? undefined,
      voted: row.task_votes.length > 0,
      comments: thread.length,
      thread,
      activity: row.activity
        .map((a) => ({ id: a.id, who: nameOf(a.actor), at: Date.parse(a.created_at), text: a.text }))
        .reverse(),
    };
    columns[row.status].push(key);
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

export const loadBoard = cache(async (workspaceSlug: string, boardSlug: string): Promise<LiveBoard | null> => {
  const auth = await getAuth();
  if (!auth) return null;
  const [ws, { data }] = await Promise.all([
    getWorkspace(workspaceSlug),
    boardQuery(auth.supabase, auth.id, `${boardColumns}, workspaces!inner(slug)`)
      .eq("workspaces.slug", workspaceSlug)
      .eq("slug", boardSlug)
      .maybeSingle(),
  ]);
  const board = data as unknown as NestedBoard | null;
  if (!ws || !board) return null;

  const names = new Map(ws.members.map((m) => [m.id, m.name]));
  const nameOf = (id: string | null) => (id && names.get(id)) || "Former member";

  return {
    me: ws.me,
    workspace: ws.workspace,
    workspaces: ws.workspaces,
    boards: ws.boards,
    members: ws.members,
    board: {
      id: board.id,
      slug: board.slug,
      name: board.name,
      prefix: board.prefix,
      labels: board.labels ?? [],
      projects: board.projects ?? [],
    },
    state: boardState(board, nameOf),
    at: Date.now(),
  };
});

export async function readBoard(supabase: Client, boardId: string, meId: string) {
  const [{ data }, { data: members }] = await Promise.all([
    boardQuery(supabase, meId).eq("id", boardId).maybeSingle(),
    supabase
      .from("members")
      .select("user_id, profiles (name), workspaces!inner(boards!inner(id))")
      .eq("workspaces.boards.id", boardId),
  ]);
  const board = data as unknown as NestedBoard | null;
  if (!board) return null;
  const names = new Map(
    (members ?? []).map((m) => [
      m.user_id,
      (m.profiles as unknown as { name: string | null } | null)?.name || "Member",
    ]),
  );
  return boardState(board, (id) => (id && names.get(id)) || "Former member");
}
