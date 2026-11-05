import { describe, expect, test } from "bun:test";
import {
  MARGIN,
  STEP,
  addKey,
  dropAt,
  dropOn,
  headAbove,
  headKey,
  itemAt,
  piecesFor,
  placeItems,
  rangeFor,
  runsFor,
  tableItems,
  type Heights,
} from "@/components/board-app/table-window";

// The table draws only the rows near the view. These check which lines it draws, where the ones it skips would be,
// and that the row numbers and drops come out the same as though every row were drawn

const rows = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}` }));
const groups = [
  { key: "status:todo", title: "To do", rows: rows("T", 3) },
  { key: "status:review", title: "Review", rows: rows("R", 2) },
  { key: "status:done", title: "Done", rows: rows("D", 4) },
];
const even: Heights = { head: 37, row: 37, add: 37 };

describe("tableItems", () => {
  test("lists each group's header, its tasks, then its add row", () => {
    const { items } = tableItems(groups, []);
    expect(items.map((it) => it.key)).toEqual([
      headKey("status:todo"), "T1", "T2", "T3", addKey("status:todo"),
      headKey("status:review"), "R1", "R2", addKey("status:review"),
      headKey("status:done"), "D1", "D2", "D3", "D4", addKey("status:done"),
    ]);
  });

  test("a folded group keeps only its header, and dropping on it puts the row last", () => {
    const { items } = tableItems(groups, ["status:review"]);
    const head = items.find((it) => it.key === headKey("status:review"));
    expect(head).toMatchObject({ kind: "head", drop: 2 });
    expect(items.some((it) => it.key === "R1" || it.key === addKey("status:review"))).toBe(false);
    expect(items.find((it) => it.key === headKey("status:todo"))).toMatchObject({ drop: 0 });
  });

  test("ungrouped, there's no header, only the tasks and one add row", () => {
    const { items } = tableItems([{ key: "all", title: "", rows: rows("A", 2) }], []);
    expect(items.map((it) => it.kind)).toEqual(["row", "row", "add"]);
    expect(items.at(-1)).toMatchObject({ drop: 2 });
  });

  test("finds each line by its key, and gives each task its place in its group", () => {
    const { items, at } = tableItems(groups, []);
    expect(items[at.get("R2")!]).toMatchObject({ kind: "row", group: "status:review", index: 1 });
    expect(items[at.get(addKey("status:done"))!].kind).toBe("add");
  });
});

describe("placeItems", () => {
  test("stacks the lines by the height of each kind, and counts the tasks above each", () => {
    const { items } = tableItems(groups.slice(0, 1), []);
    const { tops, counts } = placeItems(items, { head: 30, row: 40, add: 20 });
    expect(tops).toEqual([0, 30, 70, 110, 150, 170]);
    expect(counts).toEqual([0, 0, 1, 2, 3, 3]);
  });
});

describe("itemAt", () => {
  const tops = [0, 37, 74, 111];
  test("finds the line under a point, its top edge included", () => {
    expect(itemAt(tops, 0)).toBe(0);
    expect(itemAt(tops, 36.9)).toBe(0);
    expect(itemAt(tops, 37)).toBe(1);
    expect(itemAt(tops, 110)).toBe(2);
  });
  test("keeps to the first or last line past either end", () => {
    expect(itemAt(tops, -50)).toBe(0);
    expect(itemAt(tops, 5000)).toBe(2);
    expect(itemAt([0], 10)).toBe(0);
  });
});

describe("rangeFor", () => {
  const n = 500;
  const tops = Array.from({ length: n + 1 }, (_, i) => i * 37);

  test("at the top, draws from the first line, past the view by the margin, to a whole step", () => {
    const [start, end] = rangeFor(tops, 0, 740);
    expect(start).toBe(0);
    expect(end % STEP).toBe(0);
    expect(end).toBeGreaterThanOrEqual(20 + MARGIN);
  });

  test("always covers every line in view, with the margin either side, wherever it's scrolled", () => {
    for (let top = 0; top < n * 37; top += 13) {
      const bottom = top + 777;
      const [start, end] = rangeFor(tops, top, bottom);
      const first = itemAt(tops, top);
      const last = itemAt(tops, bottom);
      expect(start).toBeLessThanOrEqual(Math.max(0, first - MARGIN));
      expect(end).toBeGreaterThanOrEqual(Math.min(n, last + 1 + MARGIN));
      expect(start % STEP).toBe(0);
      expect(end === n || end % STEP === 0).toBe(true);
    }
  });

  test("stays put for small scrolls, so the table isn't drawn again for each one", () => {
    const ranges = new Set<string>();
    for (let top = 3700; top < 3700 + 37 * 4; top += 5) ranges.add(rangeFor(tops, top, top + 700).join(":"));
    expect(ranges.size).toBeLessThanOrEqual(2);
  });

  test("never runs past the end", () => {
    expect(rangeFor(tops, 1e6, 1e6 + 700)[1]).toBe(n);
    expect(rangeFor([0], 0, 700)).toEqual([0, 0]);
  });
});

describe("headAbove", () => {
  const { items, at } = tableItems(groups, []);
  test("is the header of the group the range starts in, when that header is above it", () => {
    expect(headAbove(items, at.get("D3")!)).toBe(at.get(headKey("status:done"))!);
    expect(headAbove(items, at.get(addKey("status:todo"))!)).toBe(at.get(headKey("status:todo"))!);
  });
  test("is nothing when the range starts on a header, or there are none", () => {
    expect(headAbove(items, at.get(headKey("status:review"))!)).toBeNull();
    expect(headAbove(tableItems([{ key: "all", title: "", rows: rows("A", 9) }], []).items, 5)).toBeNull();
  });
});

describe("runsFor", () => {
  test("adds pinned lines outside the range as runs of their own, in order", () => {
    expect(runsFor([20, 40], [5, 90], 100)).toEqual([[5, 6], [20, 40], [90, 91]]);
  });
  test("joins pins that touch or sit inside the range, and ignores what isn't there", () => {
    expect(runsFor([20, 40], [19, 40, 25, null, undefined, -1, 100], 100)).toEqual([[19, 41]]);
    expect(runsFor([0, 0], [3, 3, 4], 10)).toEqual([[3, 5]]);
  });
});

describe("piecesFor", () => {
  const { items } = tableItems(groups, []);
  const { tops, counts } = placeItems(items, even);

  test("fills what isn't drawn with gaps as tall as the lines they skip, counting the tasks among them", () => {
    const pieces = piecesFor([[0, 2], [10, 12]], tops, counts);
    expect(pieces).toEqual([
      { from: 0, to: 2, gap: false },
      // T2, T3, the add row, Review's header, R1, R2, its add row, Done's header
      { from: 2, to: 10, gap: true, height: 8 * 37, rows: 4 },
      { from: 10, to: 12, gap: false },
      { from: 12, to: 15, gap: true, height: 3 * 37, rows: 2 },
    ]);
  });

  test("keeps the body its full height and the row count whole, whatever is drawn", () => {
    for (const runs of [[], [[0, 15]], [[3, 4]], [[0, 1], [7, 9], [14, 15]]] as [number, number][][]) {
      const pieces = piecesFor(runs, tops, counts);
      const drawn = (p: (typeof pieces)[number]) => (p.gap ? p.height : tops[p.to] - tops[p.from]);
      const tasks = (p: (typeof pieces)[number]) => (p.gap ? p.rows : counts[p.to] - counts[p.from]);
      expect(pieces.reduce((sum, p) => sum + drawn(p), 0)).toBe(tops.at(-1)!);
      expect(pieces.reduce((sum, p) => sum + tasks(p), 0)).toBe(9);
    }
  });
});

describe("dropping a row", () => {
  const { items, at } = tableItems(groups, ["status:done"]);
  const { tops } = placeItems(items, even);

  test("on a task, lands above it in the top half and below it in the bottom half", () => {
    expect(dropOn(items[at.get("T2")!], false)).toEqual({ group: "status:todo", index: 1, row: "T2", side: "before" });
    expect(dropOn(items[at.get("T2")!], true)).toEqual({ group: "status:todo", index: 2, row: "T2", side: "after" });
  });

  test("on a header or an add row, lights up the whole group", () => {
    expect(dropOn(items[at.get(headKey("status:review"))!], true)).toEqual({ group: "status:review", index: 0 });
    expect(dropOn(items[at.get(addKey("status:review"))!], false)).toEqual({ group: "status:review", index: 2 });
    expect(dropOn(items[at.get(headKey("status:done"))!], false)).toEqual({ group: "status:done", index: 4 });
  });

  test("over lines not drawn, lands where it would on the drawn ones", () => {
    const r1 = at.get("R1")!;
    expect(dropAt(items, tops, tops[r1] + 5)).toEqual(dropOn(items[r1], false));
    expect(dropAt(items, tops, tops[r1] + 30)).toEqual(dropOn(items[r1], true));
    expect(dropAt([], [0], 10)).toBeNull();
  });
});
