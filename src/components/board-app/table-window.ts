import type { DropAt } from "./table-drop";

// Which of the table's rows are drawn. A board can hold hundreds of tasks and each row is a dozen controls, so the
// table draws the rows in view and a margin around them, and stands one empty row of the right height in for each
// stretch it skips. Every row of a kind is the same height, a single line cut short, so where each one sits is
// known without drawing it

/** A line of the table's body: a group's header, a task, or the row that adds a task to a group */
export type Item =
  // Dropping a row on a header puts it first in the group, or last when the group is folded away
  | { kind: "head"; key: string; group: string; drop: number }
  // index is the task's place in its group, as shown
  | { kind: "row"; key: string; group: string; id: string; index: number }
  | { kind: "add"; key: string; group: string; drop: number };

export type Kind = Item["kind"];
export type Heights = Record<Kind, number>;

// Where a dragged row would land: a line above or below a row, or a whole group lit up
export type Drop = DropAt & { row?: string; side?: "before" | "after" };

type GroupLike = { key: string; title: string; rows: readonly { id: string }[] };

export const headKey = (group: string) => `head:${group}`;
export const addKey = (group: string) => `add:${group}`;

/** The body's lines in order, and where each one is by its key: a task's id, or headKey and addKey for a group */
export function tableItems(groups: readonly GroupLike[], collapsed: readonly string[]) {
  const items: Item[] = [];
  for (const g of groups) {
    const folded = collapsed.includes(g.key);
    if (g.title) items.push({ kind: "head", key: headKey(g.key), group: g.key, drop: folded ? g.rows.length : 0 });
    if (folded) continue;
    g.rows.forEach((r, index) => items.push({ kind: "row", key: r.id, group: g.key, id: r.id, index }));
    items.push({ kind: "add", key: addKey(g.key), group: g.key, drop: g.rows.length });
  }
  return { items, at: new Map(items.map((it, i) => [it.key, i])) };
}

/**
 * Where each item starts below the top of the body, with where the last one ends at the close, and how many tasks
 * come before each, with the total at the close. A stretch left undrawn carries the row numbers past it from these
 */
export function placeItems(items: readonly Item[], h: Heights) {
  const tops = [0];
  const counts = [0];
  for (const it of items) {
    tops.push(tops[tops.length - 1] + h[it.kind]);
    counts.push(counts[counts.length - 1] + (it.kind === "row" ? 1 : 0));
  }
  return { tops, counts };
}

/** The item at y below the top of the body, kept to the first or last item past either end */
export function itemAt(tops: readonly number[], y: number) {
  let lo = 0;
  let hi = Math.max(0, tops.length - 2);
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// How many items are drawn past each edge of the view, and the step the drawn range moves in. Scrolling only draws
// the table again once it passes a step, and the margin keeps the next rows ready before they come into view
export const MARGIN = 8;
export const STEP = 10;

/** The items to draw, [start, end), for the body seen from top to bottom. Lists of taller or shorter items than the
 * table's can draw a different margin and move in a different step */
export function rangeFor(
  tops: readonly number[],
  top: number,
  bottom: number,
  { margin = MARGIN, step = STEP }: { margin?: number; step?: number } = {},
): [number, number] {
  const n = tops.length - 1;
  if (n <= 0) return [0, 0];
  const first = itemAt(tops, top);
  const last = itemAt(tops, Math.max(top, bottom));
  return [Math.max(0, Math.floor((first - margin) / step) * step), Math.min(n, Math.ceil((last + 1 + margin) / step) * step)];
}

/**
 * The header of the group the range starts inside, when the header itself is above the range. Headers stick to the
 * top while their group scrolls under them, so the one on show has to be drawn even though its place is out of view
 */
export function headAbove(items: readonly Item[], start: number) {
  if (items[start]?.kind === "head") return null;
  for (let i = start - 1; i >= 0; i--) if (items[i].kind === "head") return i;
  return null;
}

/** The stretches of items to draw, each [from, to): the range, and each pinned item wherever it is, joined where they meet */
export function runsFor(range: [number, number], pinned: readonly (number | null | undefined)[], n: number) {
  const spans: [number, number][] = [range];
  for (const i of pinned) if (i != null && i >= 0 && i < n) spans.push([i, i + 1]);
  spans.sort((a, b) => a[0] - b[0]);
  const runs: [number, number][] = [];
  for (const [from, to] of spans) {
    if (to <= from) continue;
    const last = runs.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else runs.push([from, to]);
  }
  return runs;
}

export type Piece = { from: number; to: number } & ({ gap: false } | { gap: true; height: number; rows: number });

/** The body from top to bottom: the runs drawn, and between them gaps as tall as what they skip. Without counts, a
 * gap's rows are how many items it skips */
export function piecesFor(runs: readonly [number, number][], tops: readonly number[], counts?: readonly number[]) {
  const n = tops.length - 1;
  const pieces: Piece[] = [];
  const gap = (from: number, to: number) => {
    if (to > from)
      pieces.push({
        from,
        to,
        gap: true,
        height: tops[to] - tops[from],
        rows: counts ? counts[to] - counts[from] : to - from,
      });
  };
  let at = 0;
  for (const [from, to] of runs) {
    gap(at, from);
    pieces.push({ from, to, gap: false });
    at = to;
  }
  gap(at, n);
  return pieces;
}

/** Where a row dropped on an item lands, after it when the pointer is past the middle of the item */
export function dropOn(it: Item, after: boolean): Drop {
  if (it.kind !== "row") return { group: it.group, index: it.drop };
  return { group: it.group, index: it.index + (after ? 1 : 0), row: it.id, side: after ? "after" : "before" };
}

/** Where a row dragged to y below the top of the body would land, for when the pointer is over rows not drawn yet */
export function dropAt(items: readonly Item[], tops: readonly number[], y: number): Drop | null {
  if (!items.length) return null;
  const i = itemAt(tops, y);
  return dropOn(items[i], y >= (tops[i] + tops[i + 1]) / 2);
}
