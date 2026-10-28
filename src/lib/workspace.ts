import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { boardColumns, boardQuery, boardState, countTasks, type NestedBoard } from "./board-load";
import type { Label, Priority, Size, StatusCategory } from "./board-store";
import { taskKey, type TaskRow } from "./board-sync";
import type { DitherName } from "./dither-assets";
import {
  toneFor,
  type BoardSummary,
  type LiveBoard,
  type Me,
  type Member,
  type Permissions,
  type Role,
  type WorkspaceSummary,
} from "./live";
import { createClient } from "./supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

// image_url and permissions are missing until the permissions migration runs, so rows are read whole
type WorkspaceRow = { id: string; slug: string; name: string; sigil: string; tone: string; image_url?: string | null };

const summary = (w: WorkspaceRow, role: Role, permissions?: Permissions): WorkspaceSummary => ({
  id: w.id,
  slug: w.slug,
  name: w.name,
  sigil: w.sigil as DitherName,
  tone: w.tone as WorkspaceSummary["tone"],
  image: w.image_url ?? null,
  role,
  permissions: permissions ?? {},
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
    .select("*, workspaces (*)")
    .eq("user_id", auth.id)
    .order("created_at");
  return (data ?? [])
    .filter((m) => m.workspaces)
    .map((m) => summary(m.workspaces as unknown as WorkspaceRow, m.role as Role, m.permissions as Permissions));
});

// Looked up by the workspace's address so these don't wait for the workspace list
const getContents = cache(async (slug: string) => {
  const auth = await getAuth();
  if (!auth) return null;
  const [{ data: boards }, { data: members }, counts, mine] = await Promise.all([
    auth.supabase
      .from("boards")
      .select("*, workspaces!inner(slug)")
      .eq("workspaces.slug", slug)
      .order("position")
      .order("created_at"),
    auth.supabase
      .from("members")
      .select("*, profiles (name, avatar_url), workspaces!inner(slug)")
      .eq("workspaces.slug", slug)
      .order("created_at"),
    countTasks(auth.supabase, { workspace: slug }),
    countTasks(auth.supabase, { workspace: slug }, auth.id),
  ]);
  const people: Member[] = (members ?? []).map((m) => {
    const p = m.profiles as unknown as { name: string | null; avatar_url: string | null } | null;
    return {
      id: m.user_id,
      name: p?.name || "Member",
      avatar: p?.avatar_url ?? null,
      role: m.role as Role,
      permissions: (m.permissions ?? {}) as Permissions,
      tone: toneFor(m.user_id),
      joined: m.created_at,
    };
  });
  return {
    boards: (boards ?? []).map(
      (b): BoardSummary => ({
        id: b.id,
        slug: b.slug,
        name: b.name,
        icon: b.icon ?? undefined,
        count: counts[b.id],
        mine: mine[b.id],
      }),
    ),
    members: people,
  };
});

// /home jumps straight to the last board (see proxy.ts). When that workspace has been deleted or left, the
// pages send people to /home?stale instead of a 404, which clears the cookie and picks another workspace
export async function lastBoardIn(slug: string) {
  return ((await cookies()).get("acta-last")?.value ?? "").split("/")[0] === slug;
}

export const getWorkspace = cache(async (slug: string) => {
  const [session, workspaces, contents] = await Promise.all([getSession(), getWorkspaces(), getContents(slug)]);
  if (!session || !contents) return null;
  const workspace = workspaces.find((w) => w.slug === slug);
  if (!workspace) return null;
  return { me: session.me, workspace, workspaces, boards: contents.boards, members: contents.members };
});

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
      fields: board.fields ?? [],
      statusNames: board.status_names ?? {},
      icon: board.icon,
    },
    state: boardState(board, nameOf),
    at: Date.now(),
  };
});

// A task on My tasks: what the list shows of it, and which board it's on
export type MyTask = {
  board: string;
  key: string;
  number: number;
  title: string;
  status: StatusCategory;
  priority: Priority;
  size?: Size;
  project?: string;
  labels: string[];
  start?: string;
  due?: string;
  subtasks: { done: number; total: number };
  shipped?: string;
  updated: number;
};

export type MyBoard = { id: string; slug: string; name: string; prefix: string; labels: Label[] };

/** Everything assigned to you across a workspace's boards, archived work left out */
export const getMyTasks = cache(async (slug: string) => {
  const auth = await getAuth();
  if (!auth) return null;
  const [ws, { data: boards }, { data: rows }] = await Promise.all([
    getWorkspace(slug),
    auth.supabase
      .from("boards")
      .select("id, slug, name, prefix, labels, workspaces!inner(slug)")
      .eq("workspaces.slug", slug)
      .order("position")
      .order("created_at"),
    auth.supabase
      .from("tasks")
      .select("*, boards!inner(workspaces!inner(slug))")
      .eq("boards.workspaces.slug", slug)
      .eq("assignee", auth.id)
      .is("deleted_at", null)
      .order("position")
      .order("number")
      .limit(2000),
  ]);
  if (!ws) return null;
  const prefixes = new Map((boards ?? []).map((b) => [b.id as string, b.prefix as string]));
  const tasks: MyTask[] = ((rows ?? []) as unknown as (TaskRow & { updated_at?: string })[])
    .filter((r) => !r.archived_at && prefixes.has(r.board_id))
    .map((r) => ({
      board: r.board_id,
      key: taskKey(prefixes.get(r.board_id)!, r.number),
      number: r.number,
      title: r.title,
      status: r.status,
      priority: r.priority,
      size: r.size ?? undefined,
      project: r.project ?? undefined,
      labels: r.labels ?? [],
      start: r.start_on ?? undefined,
      due: r.due_on ?? undefined,
      subtasks: { done: (r.subtasks ?? []).filter((s) => s.done).length, total: (r.subtasks ?? []).length },
      shipped: r.shipped_on ?? undefined,
      updated: r.updated_at ? Date.parse(r.updated_at) : 0,
    }));
  return {
    ...ws,
    myBoards: (boards ?? []).map(
      (b): MyBoard => ({ id: b.id, slug: b.slug, name: b.name, prefix: b.prefix, labels: (b.labels ?? []) as Label[] }),
    ),
    tasks,
  };
});

export type BoardResult = { live: LiveBoard } | { go: string } | { missing: true };

// What the board page shows: the board, or where to send someone who can't see it. Handed to the browser as a
// promise, so a board it already holds can show before this resolves
export async function openBoard(workspace: string, board: string): Promise<BoardResult> {
  const live = await loadBoard(workspace, board);
  if (live) return { live };
  if (!(await getAuth())) return { go: `/login?next=${encodeURIComponent(`/${workspace}/${board}`)}` };
  if (await getWorkspace(workspace)) return { go: `/${workspace}` };
  if (await lastBoardIn(workspace)) return { go: "/home?stale" };
  return { missing: true };
}

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
