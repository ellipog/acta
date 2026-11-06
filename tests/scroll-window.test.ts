import { describe, expect, test } from "bun:test";
import { placeCards } from "@/components/board-app/scroll-window";
import { itemAt, piecesFor, placeItems, rangeFor, runsFor, tableItems } from "@/components/board-app/table-window";

// The board's columns and the roadmap's rows draw only what's near the view, as the table does. These check where
// the cards not drawn would be, and that the blocks standing in for them add up to what they skip

const ids = (n: number) => Array.from({ length: n }, (_, i) => `ACT-${i + 1}`);

describe("placeCards", () => {
  test("each card starts where the one before ends, plus the gap", () => {
    const sizes = new Map([
      ["ACT-1", 100],
      ["ACT-2", 140],
      ["ACT-3", 90],
    ]);
    expect(placeCards(ids(3), sizes, 8)).toEqual([0, 108, 256, 354]);
  });

  test("cards not measured yet are as tall as the measured ones on average", () => {
    const sizes = new Map([
      ["ACT-1", 100],
      ["ACT-3", 140],
    ]);
    const tops = placeCards(ids(4), sizes, 0);
    expect(tops[2] - tops[1]).toBe(120);
    expect(tops[4] - tops[3]).toBe(120);
  });

  test("with nothing measured, every card takes the same guess", () => {
    const tops = placeCards(ids(5), new Map(), 8);
    const steps = tops.slice(1).map((t, i) => t - tops[i]);
    expect(new Set(steps).size).toBe(1);
    expect(steps[0]).toBeGreaterThan(8);
  });

  test("an empty column has nowhere to put anything", () => {
    expect(placeCards([], new Map(), 8)).toEqual([0]);
  });
});

describe("a column of cards drawn in part", () => {
  const n = 1500;
  const sizes = new Map(ids(n).map((id, i) => [id, 90 + (i % 5) * 10]));
  const tops = placeCards(ids(n), sizes, 8);
  const opts = { margin: 6, step: 8 };

  test("the range covers the view and its margin, in whole steps", () => {
    for (const top of [0, 5_000, 60_000, tops[n] - 800]) {
      const [start, end] = rangeFor(tops, top, top + 800, opts);
      const first = itemAt(tops, top);
      const last = itemAt(tops, top + 800);
      expect(start).toBeLessThanOrEqual(Math.max(0, first - 6));
      expect(end).toBeGreaterThanOrEqual(Math.min(n, last + 1 + 6));
      expect(start % 8).toBe(0);
      expect(end === n || end % 8 === 0).toBe(true);
      expect(end - start).toBeLessThan(40);
    }
  });

  test("scrolling within a step keeps the same range, so the column isn't drawn again", () => {
    const [a, b] = rangeFor(tops, 20_000, 20_800, opts);
    const [c, d] = rangeFor(tops, 20_030, 20_830, opts);
    expect([a, b]).toEqual([c, d]);
  });

  test("the blocks and the cards drawn add up to the whole column", () => {
    const range = rangeFor(tops, 30_000, 30_800, opts);
    // A card carried from near the top stays drawn, far from the rest
    const pieces = piecesFor(runsFor(range, [3, -1], n), tops);
    let height = 0;
    let cards = 0;
    for (const p of pieces) {
      if (p.gap) {
        height += p.height;
        cards += p.rows;
      } else {
        height += tops[p.to] - tops[p.from];
        cards += p.to - p.from;
      }
    }
    expect(height).toBe(tops[n]);
    expect(cards).toBe(n);
    expect(pieces.filter((p) => !p.gap).map((p) => [p.from, p.to])[0]).toEqual([3, 4]);
  });

  test("a card pinned inside the range draws nothing extra", () => {
    const range = rangeFor(tops, 0, 800, opts);
    expect(runsFor(range, [2], n)).toEqual([range]);
  });
});

describe("the roadmap's lines drawn in part", () => {
  const groups = [
    { key: "t:status:todo", title: "Todo", rows: ids(400).map((id) => ({ id })) },
    { key: "t:status:done", title: "Done", rows: ids(1600).map((id) => ({ id: `D${id}` })) },
  ];
  const heights = { head: 36, row: 40, add: 36 };

  test("numbers rows as though every row were drawn", () => {
    const { items } = tableItems(groups, []);
    const { tops, counts } = placeItems(items, heights);
    const range = rangeFor(tops, 50_000, 51_000, { margin: 12, step: 12 });
    for (let i = range[0]; i < range[1]; i++) {
      const it = items[i];
      if (it.kind !== "row") continue;
      const before = it.group === "t:status:todo" ? 0 : 400;
      expect(counts[i] + 1).toBe(before + it.index + 1);
    }
  });

  test("a read-only roadmap's add lines take no room", () => {
    const { items } = tableItems(groups, []);
    const { tops } = placeItems(items, { ...heights, add: 0 });
    expect(tops.at(-1)).toBe(2 * 36 + 2000 * 40);
  });
});
