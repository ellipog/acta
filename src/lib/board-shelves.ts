import { closed, type BoardState, type StatusCategory, type Task } from "./board-store";

// A board's tasks sit on shelves: one for each status, and one for everything archived. A board reads the shelves its
// view shows and leaves the rest on the server until something needs them, like done work while the filter hides it,
// a column or group folded away, or the archive until someone asks to see it. A shelf the view shows comes in pages,
// the first with the board and the rest straight after, so a long column never holds up the first paint.
//
// A shelf held only in part has a gap. It says how many of the shelf's tasks are still on the server, where the last
// of them sits, and how far reading the shelf in board order has come. Every task up to there is held, so that much
// can show as it stands. A shelf held whole has no gap

export type Shelf = StatusCategory | "archived";

// The order shelves are read in, open work first
export const shelfList: Shelf[] = ["todo", "in_progress", "review", "done", "canceled", "backlog", "archived"];
export const statusShelves = shelfList.filter((s): s is StatusCategory => s !== "archived");

// Where a task sits on its shelf, as the database orders them: by position, then by number
export type Place = { position: number; number: number };

export type Gap = {
  // How many of the shelf's tasks the server has besides those held here. Missing when they couldn't be counted
  rest?: number;
  // The last position among those, so a card put at the end of the column goes after them
  tail?: number;
  // How far reading the shelf in board order has come: every task up to here is held. Missing before any is read
  through?: Place;
};
export type Gaps = Partial<Record<Shelf, Gap>>;

// What the server counts on each shelf: how many tasks, and the last position among them
export type ShelfCounts = Partial<Record<Shelf, { count: number; tail: number | null }>>;

export const shelfOf = (t: Pick<Task, "status" | "archived">): Shelf => (t.archived ? "archived" : t.status);

const numberOf = (id: string) => Number(id.slice(id.lastIndexOf("-") + 1));

/** Whether a task sits at or above a place on its shelf */
export function upTo(t: Pick<Task, "id" | "position">, through: Place | undefined) {
  if (!through) return false;
  const p = Number.isFinite(t.position) ? t.position! : Infinity;
  return p < through.position || (p === through.position && numberOf(t.id) <= through.number);
}

/** Whether a task shows. A shelf held in part shows only as far as it has been read in order, so a task that came
 * early, like one the Inbox needed, waits for its turn rather than showing out of place */
export function shows(gaps: Gaps | undefined, t: Task) {
  const gap = gaps?.[shelfOf(t)];
  return !gap || upTo(t, gap.through);
}

export type ShelfCount = {
  // Tasks held here, and how many of those show
  held: number;
  shown: number;
  // How many more the server has. Missing when that isn't known
  rest?: number;
};

/** How many tasks each shelf has, held here or not */
export function shelfCounts(state: BoardState): Record<Shelf, ShelfCount> {
  const out = Object.fromEntries(shelfList.map((s) => [s, { held: 0, shown: 0, rest: 0 }])) as Record<Shelf, ShelfCount>;
  const gaps = state.gaps;
  for (const t of Object.values(state.tasks)) {
    const c = out[shelfOf(t)];
    c.held++;
    if (shows(gaps, t)) c.shown++;
  }
  if (gaps) for (const s of shelfList) if (gaps[s]) out[s].rest = gaps[s]!.rest;
  return out;
}

/** All of a shelf's tasks, or undefined when the server's count isn't known */
export const totalOf = (c: ShelfCount) => (c.rest === undefined ? undefined : c.held + c.rest);

/** How many of a shelf's tasks don't show, held or not. undefined when that isn't known */
export const unseenOf = (c: ShelfCount) => (c.rest === undefined ? undefined : c.held - c.shown + c.rest);

/** Tasks on the board, archived ones left out, when every shelf's count is known */
export function boardTotal(counts: Record<Shelf, ShelfCount>) {
  let n = 0;
  for (const s of statusShelves) {
    const t = totalOf(counts[s]);
    if (t === undefined) return undefined;
    n += t;
  }
  return n;
}

// What decides which shelves a view shows: someone's settings for the board, as they're kept
export type ShelfView = {
  view?: string;
  grouping?: string;
  collapsed?: string[];
  filters?: { hideDone?: boolean; archived?: boolean; status?: string[] };
};

/** The shelves a view shows. The board view shows each column that's open, and the table and the roadmap each status
 * group that's open when they group by status and every status otherwise. The public roadmap shows only what's
 * public, which it reads on its own (readPublic), and open work, which it offers to add. Done and canceled stay away
 * while the filter hides them, and so does any status a status filter leaves out. The backlog is a status from before
 * the board had columns, which only the public roadmap shows */
export function shelvesShown(v: ShelfView): Shelf[] {
  const view = v.view ?? "table";
  const grouping = v.grouping ?? "status";
  const folded = new Set(v.collapsed ?? []);
  const f = v.filters ?? {};
  const allowed = (s: StatusCategory) => !(f.hideDone && closed(s)) && (!f.status?.length || f.status.includes(s));
  const out: Shelf[] = [];
  for (const s of statusShelves) {
    if (!allowed(s)) continue;
    if (view === "public") {
      if (!closed(s)) out.push(s);
      continue;
    }
    if (s === "backlog") continue;
    const fold =
      view === "board"
        ? `board:${s}`
        : grouping !== "status"
          ? null
          : view === "roadmap"
            ? `t:status:${s}`
            : `status:${s}`;
    if (fold && folded.has(fold)) continue;
    out.push(s);
  }
  if (f.archived && view !== "public") out.push("archived");
  return out;
}

/** The shelves a board's view shows, from its settings as they're kept. Only filters someone saved come back when the
 * board opens, the same as the board itself starts */
export function shelvesFor(saved: (ShelfView & { keptFilters?: ShelfView["filters"] }) | null | undefined) {
  return shelvesShown({ ...saved, filters: saved?.keptFilters ?? {} });
}

/** A gap for each shelf the server has more of than a first read held. read is how many tasks of each shelf the read
 * brought in board order, and limit how many it asked for: one that came back short is the whole shelf. held is how
 * many of each the board holds altogether, which tasks the Inbox needed can add to */
export function gapsFrom({
  counts,
  read,
  limit,
  held,
  through,
}: {
  counts: ShelfCounts | null;
  read: Partial<Record<Shelf, number>>;
  limit: number;
  held: Partial<Record<Shelf, number>>;
  through: Partial<Record<Shelf, Place>>;
}): Gaps | undefined {
  const gaps: Gaps = {};
  for (const s of shelfList) {
    const got = read[s];
    // Fewer than were asked for is all there is
    if (got !== undefined && got < limit) continue;
    const have = held[s] ?? 0;
    const known = counts?.[s];
    if (counts && (known?.count ?? 0) <= have) continue;
    gaps[s] = {
      rest: counts ? (known?.count ?? 0) - have : undefined,
      tail: known?.tail ?? undefined,
      through: through[s],
    };
  }
  return Object.keys(gaps).length ? gaps : undefined;
}
