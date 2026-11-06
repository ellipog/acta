import { unseenOf, type Shelf, type ShelfCount } from "@/lib/board-shelves";

// What the views know of the shelves a board holds in part (see board-shelves.ts): how many tasks each has, which are
// being read, and a way to read one ahead of showing it
export type ShelfInfo = {
  counts: Record<Shelf, ShelfCount>;
  loading: ReadonlySet<Shelf>;
  // Search or a filter narrows what shows, and tasks not read can't be told apart, so their counts aren't known
  narrowed: boolean;
  // Whether the filters let a shelf show at all, as hiding done work or a status filter doesn't
  allows: (shelf: Shelf) => boolean;
  preload: (shelves: Shelf[]) => void;
};

/** How many of a shelf's tasks don't show yet, held or not. Nothing when it can't be told */
export function unseen(info: ShelfInfo | undefined, shelf: Shelf) {
  if (!info || info.narrowed) return 0;
  return unseenOf(info.counts[shelf]) ?? 0;
}

/** Whether a shelf has tasks that don't show yet, whatever the filters */
export function waiting(info: ShelfInfo | undefined, shelf: Shelf) {
  const c = info?.counts[shelf];
  return Boolean(c && (c.rest === undefined || c.rest > 0 || c.held > c.shown));
}

/** Whether a shelf is being read */
export const reading = (info: ShelfInfo | undefined, shelf: Shelf) => Boolean(info?.loading.has(shelf));
