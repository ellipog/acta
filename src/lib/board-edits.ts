import { useSyncExternalStore } from "react";
import type { CustomField, Label, Project, StatusNames } from "./board-store";
import type { LiveBoard } from "./live";

// Changes to boards that show before the server has them: a new name, labels or projects, a board on its way in
// or out. Each one lasts until the page catches up with it, or until saving fails and it's dropped

export type BoardEdit = {
  name?: string;
  icon?: string;
  slug?: string;
  labels?: Label[];
  projects?: Project[];
  fields?: CustomField[];
  statusNames?: StatusNames;
  gone?: boolean;
  // Saved, so it only waits for the page to show the same
  settled?: boolean;
  // Which edit this is, so a late reply about an older one leaves a newer one alone
  v?: number;
};
export type NewBoard = { key: string; workspace: string; name: string };
export type Edits = { boards: Record<string, BoardEdit>; adding: NewBoard[] };

let edits: Edits = { boards: {}, adding: [] };
const listeners = new Set<() => void>();
const set = (next: Edits) => {
  edits = next;
  listeners.forEach((l) => l());
};

// How long a saved change waits for the page to show it before it's let go anyway
const SETTLE = 15_000;
let version = 0;

/** Shows a change at once and returns its version, for markSaved or dropEdit */
export function editBoard(id: string, patch: Omit<BoardEdit, "v" | "settled">) {
  const v = ++version;
  const kept = Object.fromEntries(Object.entries(patch).filter(([, x]) => x !== undefined));
  set({ ...edits, boards: { ...edits.boards, [id]: { ...edits.boards[id], ...kept, settled: false, v } } });
  return v;
}

/** Drops a change, or only the given version of it */
export function dropEdit(id: string, v?: number) {
  const e = edits.boards[id];
  if (!e || (v !== undefined && e.v !== v)) return;
  const boards = { ...edits.boards };
  delete boards[id];
  set({ ...edits, boards });
}

export function markSaved(id: string, v: number) {
  const e = edits.boards[id];
  if (!e || e.v !== v) return;
  set({ ...edits, boards: { ...edits.boards, [id]: { ...e, settled: true } } });
  setTimeout(() => dropEdit(id, v), SETTLE);
}

export function startAdding(workspace: string, name: string) {
  const key = Math.random().toString(36).slice(2);
  set({ ...edits, adding: [...edits.adding, { key, workspace, name }] });
  return key;
}

export function doneAdding(key: string) {
  set({ ...edits, adding: edits.adding.filter((a) => a.key !== key) });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const empty: Edits = { boards: {}, adding: [] };

export function useBoardEdits() {
  return useSyncExternalStore(
    subscribe,
    () => edits,
    () => empty,
  );
}

const same = (a: unknown, b: unknown) => a === undefined || JSON.stringify(a) === JSON.stringify(b);

/** The board as it will be once the changes in flight are saved */
export function withEdits(live: LiveBoard, all: Edits): LiveBoard {
  if (!Object.keys(all.boards).length) return live;
  const mine = all.boards[live.board.id];
  return {
    ...live,
    boards: live.boards
      .filter((b) => !all.boards[b.id]?.gone)
      .map((b) => {
        const e = all.boards[b.id];
        return e ? { ...b, name: e.name ?? b.name, slug: e.slug ?? b.slug, icon: e.icon ?? b.icon } : b;
      }),
    board: mine
      ? {
          ...live.board,
          name: mine.name ?? live.board.name,
          labels: mine.labels ?? live.board.labels,
          projects: mine.projects ?? live.board.projects,
          fields: mine.fields ?? live.board.fields,
          statusNames: mine.statusNames ?? live.board.statusNames,
          icon: mine.icon ?? live.board.icon,
        }
      : live.board,
  };
}

/** Drops the saved changes the server's copy of the page already shows */
export function settleEdits(live: LiveBoard) {
  for (const [id, e] of Object.entries(edits.boards)) {
    if (!e.settled) continue;
    const listed = live.boards.find((b) => b.id === id);
    const caughtUp = e.gone
      ? !listed
      : listed &&
        same(e.name, listed.name) &&
        same(e.slug, listed.slug) &&
        same(e.icon, listed.icon) &&
        (id !== live.board.id ||
          (same(e.labels, live.board.labels) &&
            same(e.projects, live.board.projects) &&
            same(e.fields, live.board.fields) &&
            same(e.statusNames, live.board.statusNames)));
    if (caughtUp) dropEdit(id);
  }
}
