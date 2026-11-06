import { boardPath, cachedShell, peekBoard, rememberBoard } from "./board-cache";
import { readLive } from "./board-load";
import { viewShelves } from "./board-shelves-pref";
import type { LiveBoard } from "./live";
import { loadClient } from "./supabase/browser";

// Reads of boards this tab doesn't hold, by address, begun before the board's page has its answer from the server:
// as the page opens, or earlier, as the pointer rests on the board's link. The page takes the read when the server
// answers, so a board is read once however early that began

// A read is only used this long after it began
const EARLY = 30_000;
const started = new Map<string, { at: number; read: Promise<LiveBoard | null> }>();

// Reading ahead is a guess, so it's skipped for people saving data or on a slow connection
export function slowNetwork() {
  if (typeof navigator === "undefined") return true;
  const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(net?.saveData || (net?.effectiveType && /(^|-)2g$/.test(net.effectiveType)));
}

/**
 * Starts reading a board, unless this tab holds it or is reading it already. The workspace this tab knows says who's
 * looking and which board the address is, which is all a read needs. A read that's kept goes into the cache of boards
 * as it lands, if the page hasn't taken it by then, so a click after that shows the board at once
 */
export function startReading(workspace: string, board: string, { keep = false } = {}) {
  const path = boardPath(workspace, board);
  const shell = cachedShell(workspace);
  const id = shell?.boards.find((b) => b.slug === board)?.id;
  const early = started.get(path);
  if (!shell || !id || (early && Date.now() - early.at < EARLY) || (keep && peekBoard(path))) return;
  const read = loadClient()
    .then((client) => readLive(client, shell, id, viewShelves(id)))
    .catch(() => null);
  started.set(path, { at: Date.now(), read });
  if (keep)
    void read.then((got) => {
      if (got && started.get(path)?.read === read && !peekBoard(path)) rememberBoard(got, got.state, got.at, { ahead: true });
    });
}

/** The read begun for a board, for its page to use, if one began recently enough. It's the page's from then on */
export function takeRead(path: string) {
  const early = started.get(path);
  started.delete(path);
  return early && Date.now() - early.at < EARLY ? early.read : null;
}

/** Forgets the read begun for a board, once its page is up without it */
export const dropRead = (path: string) => void started.delete(path);
