import "server-only";
import { cache } from "react";
import { pageFrom, type BoardState, type Label, type Project, type StatusCategory, type Task } from "./board-store";
import { fromRow, taskKey, type TaskRow } from "./board-sync";
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

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, avatar_url")
    .eq("id", data.user.id)
    .maybeSingle();
  const me: Me = {
    id: data.user.id,
    name: profile?.name || data.user.email?.split("@")[0] || "You",
    email: data.user.email ?? "",
    avatar: profile?.avatar_url ?? null,
  };
  return { supabase, me };
});

export const getWorkspaces = cache(async (): Promise<WorkspaceSummary[]> => {
  const session = await getSession();
  if (!session) return [];
  const { data } = await session.supabase
    .from("members")
    .select("role, created_at, workspaces (id, slug, name, sigil, tone)")
    .eq("user_id", session.me.id)
    .order("created_at");
  return (data ?? [])
    .filter((m) => m.workspaces)
    .map((m) => summary(m.workspaces as unknown as WorkspaceRow, m.role as Role));
});

export const getWorkspace = cache(async (slug: string) => {
  const session = await getSession();
  if (!session) return null;
  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((w) => w.slug === slug);
  if (!workspace) return null;
  const { supabase } = session;
  const [{ data: boards }, { data: members }] = await Promise.all([
    supabase
      .from("boards")
      .select("id, slug, name")
      .eq("workspace_id", workspace.id)
      .order("position")
      .order("created_at"),
    supabase
      .from("members")
      .select("user_id, role, created_at, profiles (name, avatar_url)")
      .eq("workspace_id", workspace.id)
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
  return { me: session.me, workspace, workspaces, boards: (boards ?? []) as BoardSummary[], members: people };
});

const statusKeys: StatusCategory[] = ["backlog", "todo", "in_progress", "review", "done"];

export async function readBoardState(
  supabase: Client,
  board: {
    id: string;
    prefix: string;
    name: string;
    slug: string;
    next_number: number;
    roadmap_public: boolean;
    page: object;
  },
  meId: string,
  nameOf: (id: string | null) => string,
): Promise<BoardState> {
  const id = board.id;
  const [tasks, comments, activity, votes, suggestions, suggestionVotes] = await Promise.all([
    supabase.from("tasks").select("*").eq("board_id", id).is("deleted_at", null).order("position").order("number"),
    supabase.from("comments").select("id, number, author, body, created_at").eq("board_id", id).order("created_at"),
    supabase
      .from("activity")
      .select("id, number, actor, text, created_at")
      .eq("board_id", id)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("task_votes").select("number").eq("board_id", id).eq("voter", `u:${meId}`),
    supabase.from("suggestions").select("*").eq("board_id", id).order("vote_count", { ascending: false }),
    supabase.from("suggestion_votes").select("suggestion_id").eq("voter", `u:${meId}`),
  ]);

  const voted = new Set((votes.data ?? []).map((v) => v.number as number));
  const suggestionVoted = new Set((suggestionVotes.data ?? []).map((v) => v.suggestion_id as string));
  const map: Record<string, Task> = {};
  const columns = Object.fromEntries(statusKeys.map((s) => [s, [] as string[]])) as BoardState["columns"];

  for (const row of (tasks.data ?? []) as TaskRow[]) {
    const key = taskKey(board.prefix, row.number);
    map[key] = {
      id: key,
      ...fromRow(row),
      origin: row.origin ?? undefined,
      voted: voted.has(row.number),
      comments: 0,
      thread: [],
      activity: [],
    };
    columns[row.status].push(key);
  }
  for (const c of comments.data ?? []) {
    const t = map[taskKey(board.prefix, c.number)];
    if (!t) continue;
    t.thread!.push({ id: c.id, who: nameOf(c.author), at: Date.parse(c.created_at), body: c.body });
    t.comments = t.thread!.length;
  }
  for (const a of [...(activity.data ?? [])].reverse()) {
    const t = map[taskKey(board.prefix, a.number)];
    if (t) t.activity.push({ id: a.id, who: nameOf(a.actor), at: Date.parse(a.created_at), text: a.text });
  }

  return {
    next: board.next_number,
    tasks: map,
    columns,
    roadmap: {
      public: board.roadmap_public,
      suggestions: (suggestions.data ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        details: s.details ?? undefined,
        by: s.by_name,
        at: Date.parse(s.created_at),
        votes: s.vote_count,
        voted: suggestionVoted.has(s.id),
      })),
      page: pageFrom(board.name, board.slug, board.page),
    },
  };
}

export const loadBoard = cache(async (workspaceSlug: string, boardSlug: string): Promise<LiveBoard | null> => {
  const ws = await getWorkspace(workspaceSlug);
  if (!ws) return null;
  const session = (await getSession())!;
  const { data: board } = await session.supabase
    .from("boards")
    .select("id, slug, name, prefix, next_number, labels, projects, roadmap_public, page")
    .eq("workspace_id", ws.workspace.id)
    .eq("slug", boardSlug)
    .maybeSingle();
  if (!board) return null;

  const names = new Map(ws.members.map((m) => [m.id, m.name]));
  const nameOf = (id: string | null) => (id && names.get(id)) || "Former member";
  const state = await readBoardState(session.supabase, board, ws.me.id, nameOf);

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
      labels: (board.labels ?? []) as Label[],
      projects: (board.projects ?? []) as Project[],
    },
    state,
  };
});
