import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  boardInfo,
  boardQuery,
  boardState,
  countShelves,
  countTasks,
  firstRead,
  recentLines,
  type NestedBoard,
} from "./board-load";
import { shelvesFor, type ShelfView } from "./board-shelves";
import type { Label, Priority, Size, StatusCategory } from "./board-store";
import { taskKey, type TaskRow } from "./board-sync";
import type { DitherName } from "./dither-assets";
import {
  toneFor,
  type BoardSummary,
  type LiveBoard,
  type LiveFrame,
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

// Before a migration adds a column, naming it fails the read, which is then made without it
const noColumn = (code?: string) => code === "42703" || code === "PGRST204";

// The sidebar's boards: what it shows of each, not their pages and settings
async function sidebarBoards(supabase: Client, slug: string): Promise<{ data: SidebarBoard[] | null }> {
  const list = (columns: "id, slug, name, icon" | "id, slug, name") =>
    supabase
      .from("boards")
      .select(`${columns}, workspaces!inner(slug)`)
      .eq("workspaces.slug", slug)
      .order("position")
      .order("created_at");
  const named = await list("id, slug, name, icon");
  // icon is missing until the board icons migration runs
  const { data } = named.error && noColumn(named.error.code) ? await list("id, slug, name") : named;
  return { data: data as unknown as SidebarBoard[] | null };
}

type SidebarBoard = { id: string; slug: string; name: string; icon?: string | null };

// Looked up by the workspace's address so these don't wait for the workspace list
const getContents = cache(async (slug: string) => {
  const auth = await getAuth();
  if (!auth) return null;
  const [{ data: boards }, { data: members }, counts, mine] = await Promise.all([
    sidebarBoards(auth.supabase, slug),
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

// How each of your boards is set to show, as far as it decides which of its tasks to read: its view, grouping,
// folded columns and saved filters. All of them come at once, as the board's id isn't known yet when this starts.
// Before the settings migration runs there are none, and boards open as they do by default
const getViews = cache(async () => {
  const auth = await getAuth();
  if (!auth) return new Map<string, ShelfView & { keptFilters?: ShelfView["filters"] }>();
  const { data, error } = await auth.supabase
    .from("user_prefs")
    .select("key, view:value->>view, grouping:value->>grouping, collapsed:value->collapsed, keptFilters:value->keptFilters")
    .eq("user_id", auth.id)
    .like("key", "prefs-%");
  const rows = (error ? [] : (data ?? [])) as unknown as {
    key: string;
    view: string | null;
    grouping: string | null;
    collapsed: unknown;
    keptFilters: unknown;
  }[];
  return new Map(
    rows.map((r) => [
      r.key.slice("prefs-".length),
      {
        view: r.view ?? undefined,
        grouping: r.grouping ?? undefined,
        collapsed: Array.isArray(r.collapsed) ? r.collapsed.filter((k): k is string => typeof k === "string") : [],
        keptFilters: r.keptFilters && typeof r.keptFilters === "object" ? (r.keptFilters as ShelfView["filters"]) : {},
      },
    ]),
  );
});

export const loadBoard = cache(async (workspaceSlug: string, boardSlug: string): Promise<LiveBoard | null> => {
  const auth = await getAuth();
  if (!auth) return null;
  // The workspace's list of boards says which board this is, and your settings for it which shelves it shows. Both
  // are read at once, and then the board, its counts and its Inbox
  const [ws, views] = await Promise.all([getWorkspace(workspaceSlug), getViews()]);
  const boardId = ws?.boards.find((b) => b.slug === boardSlug)?.id;
  if (!ws || !boardId) return null;
  const shelves = shelvesFor(views.get(boardId));
  const [{ data }, counts, recent] = await Promise.all([
    boardQuery(auth.supabase, auth.id, shelves).eq("id", boardId).maybeSingle(),
    countShelves(auth.supabase, boardId),
    recentLines(auth.supabase, boardId, auth.id),
  ]);
  if (!data) return null;
  const { board, first } = firstRead(data as unknown as Record<string, unknown>, shelves, counts);

  const names = new Map(ws.members.map((m) => [m.id, m.name]));
  const nameOf = (id: string | null) => (id && names.get(id)) || "Former member";

  return {
    me: ws.me,
    workspace: ws.workspace,
    workspaces: ws.workspaces,
    boards: ws.boards,
    members: ws.members,
    board: boardInfo(board),
    state: boardState(board, nameOf, recent, first),
    at: Date.now(),
  };
});

// The board's own row and the workspace around it, without its tasks
const loadFrame = cache(async (workspaceSlug: string, boardSlug: string): Promise<LiveFrame | null> => {
  const auth = await getAuth();
  if (!auth) return null;
  const [ws, { data }] = await Promise.all([
    getWorkspace(workspaceSlug),
    auth.supabase
      .from("boards")
      .select("*, workspaces!inner(slug)")
      .eq("workspaces.slug", workspaceSlug)
      .eq("slug", boardSlug)
      .maybeSingle(),
  ]);
  const board = data as unknown as NestedBoard | null;
  if (!ws || !board) return null;
  return {
    me: ws.me,
    workspace: ws.workspace,
    workspaces: ws.workspaces,
    boards: ws.boards,
    members: ws.members,
    board: boardInfo(board),
  };
});

// A move from another page asks with fetch, while loading the page whole is a document request. A browser that
// doesn't say counts as loading it whole
async function movingBetweenPages() {
  return (await headers()).get("sec-fetch-dest") === "empty";
}

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

// What My tasks shows of a task, without its description
const myTaskColumns =
  "board_id, number, title, status, priority, size, project, labels, start_on, due_on, subtasks, shipped_on, updated_at";

async function assignedTasks(supabase: Client, slug: string, me: string) {
  const list = (columns: string) =>
    supabase
      .from("tasks")
      .select(`${columns}, boards!inner(workspaces!inner(slug))`)
      .eq("boards.workspaces.slug", slug)
      .eq("assignee", me)
      .is("deleted_at", null)
      .order("position")
      .order("number")
      .limit(2000);
  const named = await list(`${myTaskColumns}, archived_at`);
  // archived_at is missing until the archive migration runs
  return named.error && noColumn(named.error.code) ? await list(myTaskColumns) : named;
}

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
    assignedTasks(auth.supabase, slug, auth.id),
  ]);
  if (!ws) return null;
  const prefixes = new Map((boards ?? []).map((b) => [b.id as string, b.prefix as string]));
  type MyTaskRow = Pick<
    TaskRow,
    | "board_id"
    | "number"
    | "title"
    | "status"
    | "priority"
    | "size"
    | "project"
    | "labels"
    | "start_on"
    | "due_on"
    | "subtasks"
    | "shipped_on"
    | "archived_at"
  > & { updated_at?: string };
  const tasks: MyTask[] = ((rows ?? []) as unknown as MyTaskRow[])
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

export type BoardResult = { live: LiveBoard } | { frame: LiveFrame } | { go: string } | { missing: true };

// What the board page shows: the board, or where to send someone who can't see it. Handed to the browser as a
// promise, so a board it already holds can show before this resolves.
//
// Loading the page whole draws the board here. Moving to it from another page sends only the workspace and the
// board's own details: the browser shows the copy it holds and reads what changed since, or reads the board itself
// when it holds none. Sending the whole board again would only be thrown away
export async function openBoard(workspace: string, board: string): Promise<BoardResult> {
  if (await movingBetweenPages()) {
    const frame = await loadFrame(workspace, board);
    if (frame) return { frame };
  } else {
    const live = await loadBoard(workspace, board);
    if (live) return { live };
  }
  if (!(await getAuth())) return { go: `/login?next=${encodeURIComponent(`/${workspace}/${board}`)}` };
  if (await getWorkspace(workspace)) return { go: `/${workspace}` };
  if (await lastBoardIn(workspace)) return { go: "/home?stale" };
  return { missing: true };
}
