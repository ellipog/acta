import { useSyncExternalStore } from "react";
import type { BoardState } from "./board-store";
import type { LiveBoard } from "./live";

// Boards this tab has already shown or fetched ahead, so going back to one shows it straight away. Each entry
// holds the board as it last stood and when that was, so only what changed since has to be read. It lives in
// memory only: a reload reads everything from the server again

export type CachedBoard = LiveBoard & { cachedAt: number };

const boards = new Map<string, CachedBoard>();
// Snapshots older than this are thrown away rather than shown and corrected
const KEEP = 30 * 60_000;

export const boardPath = (workspace: string, board: string) => `${workspace}/${board}`;

export function cachedBoard(path: string): CachedBoard | null {
  if (typeof window === "undefined") return null;
  const hit = boards.get(path);
  if (!hit) return null;
  if (Date.now() - hit.cachedAt > KEEP) {
    boards.delete(path);
    return null;
  }
  return hit;
}

/** Keeps a board's state. `at` is when the state was last known to be complete */
export function rememberBoard(live: LiveBoard, state: BoardState, at: number) {
  const path = boardPath(live.workspace.slug, live.board.slug);
  boards.set(path, { ...live, state, at, cachedAt: Date.now() });
  setCount(live.board.id, Object.keys(state.tasks).length);
}

export function forgetBoard(path: string) {
  boards.delete(path);
}

// Each workspace's frame: who you are, its boards and people. Enough to draw the sidebar while a board loads
export type Shell = Pick<LiveBoard, "me" | "workspace" | "workspaces" | "boards" | "members">;
const shells = new Map<string, Shell>();

export function rememberShell(live: Shell) {
  shells.set(live.workspace.slug, {
    me: live.me,
    workspace: live.workspace,
    workspaces: live.workspaces,
    boards: live.boards,
    members: live.members,
  });
  const known: Record<string, number> = {};
  for (const b of live.boards) if (b.count !== undefined) known[b.id] = b.count;
  setCounts(known);
}

export const cachedShell = (slug: string) => (typeof window === "undefined" ? null : (shells.get(slug) ?? null));

// How many tasks each board holds, kept current for the sidebar
let counts: Record<string, number> = {};
const listeners = new Set<() => void>();

export function setCounts(next: Record<string, number>) {
  if (Object.entries(next).every(([id, n]) => counts[id] === n)) return;
  counts = { ...counts, ...next };
  listeners.forEach((l) => l());
}

export const setCount = (id: string, n: number) => setCounts({ [id]: n });

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const none: Record<string, number> = {};

export function useCounts() {
  return useSyncExternalStore(
    subscribe,
    () => counts,
    () => none,
  );
}
