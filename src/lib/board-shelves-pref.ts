import { readPref } from "./account-prefs";
import { shelvesFor, type ShelfView } from "./board-shelves";

/** The shelves a board's view shows, from this browser's copy of its settings, for reading it before it opens */
export const viewShelves = (boardId: string) =>
  shelvesFor(readPref<ShelfView & { keptFilters?: ShelfView["filters"] }>(`prefs-${boardId}`));
