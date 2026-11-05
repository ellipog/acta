import { describe, expect, test } from "bun:test";
import { saveChanges } from "@/lib/board-save";
import {
  boardReducer,
  movesFor,
  pageFrom,
  positionsBetween,
  positionsFor,
  type BoardAction,
  type BoardState,
  type StatusCategory,
} from "@/lib/board-store";
import { apply, renumber, resolve, SentLog, type Context, type RemoteEvent } from "@/lib/board-sync";
import { demoReducer, initDemo, type Demo } from "@/components/board-app/demo-state";
import { FakeBoardServer } from "./fake-server";

// Cards keep sparse positions: a card that moves takes a position between its new neighbours, so a move saves one
// row and everyone watching hears of one change. These check the arithmetic, that the board on screen, the board
// saved and every other board watching agree on the order, and that undo and moves made at the same time by two
// people still come out the same everywhere

const ctx: Context = { prefix: "ACT", nameOf: () => "Someone", page: (p) => pageFrom("Web", "web", p) };
const run = (s: BoardState, ...a: BoardAction[]) => a.reduce(boardReducer, s);
const titles = (s: BoardState, status: StatusCategory) => s.columns[status].map((id) => s.tasks[id].title);
const number = (id: string) => Number(id.slice(id.lastIndexOf("-") + 1));

/** Every column lists its cards by position, then number, the way the database orders them */
function expectOrdered(s: BoardState) {
  for (const [status, ids] of Object.entries(s.columns)) {
    const sorted = [...ids].sort(
      (a, b) => s.tasks[a].position! - s.tasks[b].position! || number(a) - number(b),
    );
    expect({ status, ids }).toEqual({ status, ids: sorted });
    for (const id of ids) expect(Number.isFinite(s.tasks[id].position)).toBe(true);
  }
}

/** One person's open board: what's saved, what's on screen with its undo history, and what it saved lately */
class Tab {
  base: BoardState;
  demo: Demo;
  sent = new SentLog();
  constructor(private server: FakeBoardServer) {
    this.base = server.load();
    this.demo = initDemo(this.base);
  }
  get ui() {
    return this.demo.board;
  }
  act(...actions: (BoardAction | { type: "undo" } | { type: "redo" })[]) {
    for (const a of actions) this.demo = demoReducer(this.demo, a);
    return this;
  }
  /** Saves what's on screen, as the board does, and returns what the live feed then sends everyone */
  async save() {
    const from = this.server.writes.length;
    const r = await saveChanges(this.base, this.ui, this.server.send, "ACT");
    expect(r.refused).toEqual([]);
    for (const [a, b] of r.renamed)
      this.demo = demoReducer(this.demo, { type: "rebase", current: (s) => renumber(s, a, b), history: (s) => renumber(s, a, b) });
    for (const part of r.saved) this.sent.record(part, r.goal);
    this.base = r.base;
    return feed(this.server, from);
  }
  /** Changes from the live feed, taken in the way the board takes them */
  hear(events: RemoteEvent[]) {
    for (const ev of events) {
      const before = this.base;
      const change = this.sent.screen(resolve(before, ev, ctx));
      if (change.kind === "none") continue;
      this.base = apply(before, change);
      this.demo = demoReducer(this.demo, {
        type: "rebase",
        current: (b) => apply(b, change, before),
        history: (b) => apply(b, change),
      });
    }
    return this;
  }
}

// One change for each row written, as the row stands after the save
const feed = (server: FakeBoardServer, from: number): RemoteEvent[] =>
  server.writes.slice(from).map((n) => ({ table: "tasks", row: structuredClone(server.tasks.get(n)!) }));

async function board(count: number, status: StatusCategory = "todo") {
  const server = new FakeBoardServer();
  const empty = server.load();
  const actions: BoardAction[] = Array.from({ length: count }, (_, i) => ({ type: "add", status, title: `T${i + 1}` }));
  await saveChanges(empty, run(empty, ...actions), server.send, "ACT");
  server.writes = [];
  server.requests = [];
  return server;
}

describe("positions", () => {
  test("go between two neighbours, or one past an end", () => {
    expect(positionsBetween(0, 1, 1)).toEqual([0.5]);
    expect(positionsBetween(0, 1, 3)).toEqual([0.25, 0.5, 0.75]);
    expect(positionsBetween(undefined, 3, 2)).toEqual([1, 2]);
    expect(positionsBetween(5, undefined, 2)).toEqual([6, 7]);
    expect(positionsBetween(-2.5, undefined, 1)).toEqual([-1.5]);
    expect(positionsBetween(undefined, undefined, 3)).toEqual([0, 1, 2]);
  });

  test("don't fit between neighbours that are too close or the same", () => {
    expect(positionsBetween(1, 1, 1)).toBeNull();
    expect(positionsBetween(1, 1 + 1e-12, 1)).toBeNull();
    expect(positionsBetween(2 ** 60, undefined, 1)).toBeNull();
  });

  test("a column in order keeps every position", () => {
    const cards = [0, 1, 2.5, 7].map((position, i) => ({ number: i + 1, position }));
    expect(positionsFor(cards)).toEqual([0, 1, 2.5, 7]);
    expect(movesFor(cards)).toEqual([]);
  });

  test("a card moved to the top of a long column is the only one that changes", () => {
    const column = Array.from({ length: 100 }, (_, i) => ({ number: i + 1, position: i }));
    const last = column.pop()!;
    expect(movesFor([last, ...column])).toEqual([{ number: 100, position: -1 }]);
    expect(movesFor([column[0], last, ...column.slice(1)])).toEqual([{ number: 100, position: 0.5 }]);
  });

  test("a card marked as moved goes between its neighbours, unless it already fits there", () => {
    expect(positionsFor([{ number: 1, position: 0 }, { number: 9, position: 5, moved: true }, { number: 2, position: 1 }])).toEqual([0, 0.5, 1]);
    expect(positionsFor([{ number: 1, position: 0 }, { number: 9, position: 0.25, moved: true }, { number: 2, position: 1 }])).toEqual([0, 0.25, 1]);
  });

  test("cards without a position get one", () => {
    expect(positionsFor([{ number: 1 }, { number: 2 }])).toEqual([0, 1]);
    expect(positionsFor([{ number: 1, position: 4 }, { number: 2 }, { number: 3 }])).toEqual([4, 5, 6]);
    expect(positionsFor([{ number: 2 }, { number: 1, position: 4 }])).toEqual([3, 4]);
  });

  test("cards that share a position are ordered by number", () => {
    expect(movesFor([{ number: 3, position: 1 }, { number: 5, position: 1 }])).toEqual([]);
    const flipped = positionsFor([{ number: 5, position: 1 }, { number: 3, position: 1 }, { number: 4, position: 2 }]);
    expect(flipped[0] < flipped[1] || (flipped[0] === flipped[1] && 5 < 3)).toBe(true);
  });

  test("a column is numbered again only when there's no room left, and keeps its order", () => {
    const cards = [
      { number: 1, position: 1 },
      { number: 7, moved: true },
      { number: 2, position: 1 + 1e-12 },
      { number: 3, position: 9 },
    ];
    expect(positionsFor(cards)).toEqual([0, 1, 2, 3]);
  });
});

describe("the board keeps its columns in order by position", () => {
  test("after any mix of moves, adds, deletes and undeletes", async () => {
    const server = await board(12);
    let s = run(server.load(), ...["review", "done", "in_progress"].flatMap((status) =>
      Array.from({ length: 4 }, (_, i): BoardAction => ({ type: "add", status: status as StatusCategory, title: `${status} ${i}` })),
    ));
    // A small, fixed sequence of pseudo random numbers, so a failure is the same every run
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const statuses: StatusCategory[] = ["todo", "in_progress", "review", "done"];
    let deleted: { task: BoardState["tasks"][string]; index: number } | null = null;
    for (let step = 0; step < 400; step++) {
      const ids = Object.keys(s.tasks);
      const id = ids[random(ids.length)];
      const to = statuses[random(statuses.length)];
      const column = s.columns[to].filter((x) => x !== id);
      const kind = random(10);
      if (kind < 6) s = boardReducer(s, { type: "move", id, to, before: column[random(column.length + 1)] ?? null });
      else if (kind === 6) s = boardReducer(s, { type: "update", id, patch: { status: to } });
      else if (kind === 7) s = boardReducer(s, { type: "columns", columns: { ...s.columns, [to]: [...s.columns[to]].reverse() } });
      else if (kind === 8 && !deleted) {
        deleted = { task: s.tasks[id], index: s.columns[s.tasks[id].status].indexOf(id) };
        s = boardReducer(s, { type: "delete", ids: [id] });
      } else if (deleted) {
        s = boardReducer(s, { type: "undelete", items: [deleted] });
        deleted = null;
      }
      expectOrdered(s);
    }
  });

  test("dropping cards into the same gap again and again numbers the column afresh now and then", () => {
    let s = run(new FakeBoardServer().load(), { type: "add", status: "todo", title: "Top" }, { type: "add", status: "todo", title: "Bottom" });
    let renumbered = 0;
    for (let i = 0; i < 200; i++) {
      const before = s;
      s = run(s, { type: "add", status: "todo", title: `New ${i}` });
      const id = s.columns.todo.at(-1)!;
      s = boardReducer(s, { type: "move", id, to: "todo", before: s.columns.todo[1] });
      const changed = Object.keys(s.tasks).filter((t) => before.tasks[t] && before.tasks[t].position !== s.tasks[t].position);
      if (changed.length) renumbered++;
      expectOrdered(s);
    }
    expect(titles(s, "todo")[0]).toBe("Top");
    expect(titles(s, "todo")[1]).toBe("New 199");
    expect(titles(s, "todo").at(-1)).toBe("Bottom");
    // Each new card halves the gap it goes into, so the column runs out of room every 30 or so
    expect(renumbered).toBeGreaterThan(0);
    expect(renumbered).toBeLessThan(15);
  });
});

describe("a move saves one row", () => {
  test("to the top of a column of 100", async () => {
    const server = await board(100);
    const base = server.load();
    const ui = run(base, { type: "move", id: "ACT-100", to: "todo", before: "ACT-1" });
    const r = await saveChanges(base, ui, server.send, "ACT");
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].order).toEqual([{ number: 100, position: -1 }]);
    expect(server.writes).toEqual([100]);
    expect(titles(server.load(), "todo")).toEqual(titles(ui, "todo"));
    expect(titles(r.base, "todo")).toEqual(titles(ui, "todo"));
  });

  test("to another column, written once with its new status", async () => {
    const server = await board(10);
    const s = run(server.load(), ...Array.from({ length: 5 }, (_, i): BoardAction => ({ type: "add", status: "review", title: `R${i}` })));
    await saveChanges(server.load(), s, server.send, "ACT");
    server.writes = [];
    const base = server.load();
    const ui = run(base, { type: "move", id: "ACT-4", to: "review", before: "ACT-13", note: "moved it to In review" });
    await saveChanges(base, ui, server.send, "ACT");
    expect(server.writes).toEqual([4]);
    expect(titles(server.load(), "review")).toEqual(["R0", "R1", "T4", "R2", "R3", "R4"]);
    expect(titles(server.load(), "todo")).toEqual(titles(ui, "todo"));
  });

  test("deleting a card leaves the cards below it alone", async () => {
    const server = await board(20);
    const base = server.load();
    await saveChanges(base, run(base, { type: "delete", ids: ["ACT-3"] }), server.send, "ACT");
    expect(server.writes).toEqual([3]);
    expect(server.requests[0].order).toEqual([]);
  });

  test("on a board saved with whole numbers from 0, as every board was before", async () => {
    const server = await board(30);
    expect([...server.tasks.values()].map((t) => t.position)).toEqual(Array.from({ length: 30 }, (_, i) => i));
    const base = server.load();
    const ui = run(base, { type: "move", id: "ACT-2", to: "todo", before: "ACT-20" });
    await saveChanges(base, ui, server.send, "ACT");
    expect(server.writes).toEqual([2]);
    expect(server.tasks.get(2)!.position).toBe(18.5);
    expect(titles(server.load(), "todo")).toEqual(titles(ui, "todo"));
  });
});

describe("undo and redo", () => {
  test("of a move each save one row, and put the card back where it was", async () => {
    const server = await board(50);
    const tab = new Tab(server);
    const start = titles(tab.ui, "todo");
    tab.act({ type: "move", id: "ACT-50", to: "todo", before: "ACT-1" });
    expect(await tab.save()).toHaveLength(1);
    const moved = titles(tab.ui, "todo");
    tab.act({ type: "undo" });
    expect(titles(tab.ui, "todo")).toEqual(start);
    expect(await tab.save()).toHaveLength(1);
    expect(titles(server.load(), "todo")).toEqual(start);
    tab.act({ type: "redo" });
    expect(await tab.save()).toHaveLength(1);
    expect(titles(server.load(), "todo")).toEqual(moved);
  });

  test("of a drag to another column, after someone else moved a card in it", async () => {
    const server = await board(6);
    const mine = new Tab(server);
    const theirs = new Tab(server);
    mine.act({ type: "move", id: "ACT-1", to: "done", before: null, note: "moved it to Done" });
    const a = await mine.save();
    theirs.hear(a).act({ type: "move", id: "ACT-6", to: "todo", before: "ACT-2" });
    mine.hear(await theirs.save());
    // Undo takes back the drag, and keeps what someone else did since
    mine.act({ type: "undo" });
    expect(titles(mine.ui, "todo")).toEqual(["T1", "T6", "T2", "T3", "T4", "T5"]);
    expect(await mine.save()).toHaveLength(1);
    theirs.hear(feed(server, server.writes.length - 1));
    for (const s of [mine.ui, theirs.ui, server.load()]) {
      expect(titles(s, "todo")).toEqual(["T1", "T6", "T2", "T3", "T4", "T5"]);
      expect(titles(s, "done")).toEqual([]);
    }
  });
});

describe("two people moving cards at once", () => {
  test("in the same column both keep their moves, and everyone sees the same order", async () => {
    const server = await board(8);
    const a = new Tab(server);
    const b = new Tab(server);
    a.act({ type: "move", id: "ACT-8", to: "todo", before: "ACT-1" });
    b.act({ type: "move", id: "ACT-2", to: "todo", before: null });
    const fromA = await a.save();
    const fromB = await b.save();
    a.hear([...fromA, ...fromB]);
    b.hear([...fromA, ...fromB]);
    const expected = ["T8", "T1", "T3", "T4", "T5", "T6", "T7", "T2"];
    for (const s of [a.ui, b.ui, a.base, b.base, server.load()]) expect(titles(s, "todo")).toEqual(expected);
  });

  test("into the same gap end up in the same order everywhere", async () => {
    const server = await board(4);
    const a = new Tab(server);
    const b = new Tab(server);
    a.act({ type: "move", id: "ACT-4", to: "todo", before: "ACT-2" });
    b.act({ type: "move", id: "ACT-3", to: "todo", before: "ACT-2" });
    const fromA = await a.save();
    const fromB = await b.save();
    a.hear(fromB);
    b.hear(fromA);
    // They took the same position, and the lower number goes first, as the database orders them
    expect(server.tasks.get(3)!.position).toBe(server.tasks.get(4)!.position);
    for (const s of [a.ui, b.ui, server.load()]) expect(titles(s, "todo")).toEqual(["T1", "T3", "T4", "T2"]);
    // There's no room between the two, so the next card dropped there numbers the column again
    a.act({ type: "move", id: "ACT-1", to: "todo", before: "ACT-4" });
    b.hear(await a.save());
    for (const s of [a.ui, b.ui, server.load()]) expect(titles(s, "todo")).toEqual(["T3", "T1", "T4", "T2"]);
  });

  test("a move not saved yet stays on screen while someone else's comes in, and both save", async () => {
    const server = await board(6);
    const a = new Tab(server);
    const b = new Tab(server);
    a.act({ type: "move", id: "ACT-6", to: "todo", before: "ACT-1" });
    b.act({ type: "move", id: "ACT-1", to: "todo", before: null });
    a.hear(await b.save());
    expect(titles(a.ui, "todo")).toEqual(["T6", "T2", "T3", "T4", "T5", "T1"]);
    const fromA = await a.save();
    // Only the card this person moved is saved, so the other move isn't undone
    expect(fromA).toHaveLength(1);
    b.hear(fromA);
    for (const s of [a.ui, b.ui, server.load()]) expect(titles(s, "todo")).toEqual(["T6", "T2", "T3", "T4", "T5", "T1"]);
  });

  test("the same card ends where the last save put it", async () => {
    const server = await board(5);
    const a = new Tab(server);
    const b = new Tab(server);
    a.act({ type: "move", id: "ACT-3", to: "todo", before: "ACT-1" });
    b.act({ type: "move", id: "ACT-3", to: "review", before: null, note: "moved it to In review" });
    const fromA = await a.save();
    const fromB = await b.save();
    // The live feed sends both saves to both, in the order they were made, each person's own included
    a.hear([...fromA, ...fromB]);
    b.hear([...fromA, ...fromB]);
    for (const s of [a.ui, b.ui, server.load()]) {
      expect(titles(s, "todo")).toEqual(["T1", "T2", "T4", "T5"]);
      expect(titles(s, "review")).toEqual(["T3"]);
    }
  });

  test("while one waits on their own save, the other's move comes in once it's done", async () => {
    const server = await board(4);
    const a = new Tab(server);
    const b = new Tab(server);
    b.act({ type: "move", id: "ACT-4", to: "todo", before: "ACT-1" });
    const fromB = await b.save();
    // A saved after B without hearing of B's move first, as when B's change waits in the queue during A's save
    a.act({ type: "move", id: "ACT-1", to: "todo", before: null });
    const fromA = await a.save();
    a.hear([...fromB, ...fromA]);
    b.hear(fromA);
    for (const s of [a.ui, b.ui, server.load()]) expect(titles(s, "todo")).toEqual(["T4", "T2", "T3", "T1"]);
  });
});

describe("catching up", () => {
  test("rows read after a reconnect land in the saved order whatever order they come in", async () => {
    const server = await board(12);
    const away = new Tab(server);
    const here = new Tab(server);
    here.act(
      { type: "move", id: "ACT-12", to: "todo", before: "ACT-1" },
      { type: "move", id: "ACT-5", to: "done", before: null, note: "moved it to Done" },
      { type: "move", id: "ACT-7", to: "todo", before: "ACT-3" },
    );
    here.act({ type: "columns", columns: { ...here.ui.columns, todo: [...here.ui.columns.todo].reverse() } });
    const sent = await here.save();
    // Reading what changed since gives each row once, newest first or in any other order
    const rows = [...new Map(sent.map((e) => [e.table === "tasks" ? e.row.number : 0, e])).values()].reverse();
    away.hear(rows);
    for (const status of ["todo", "done"] as const) {
      expect(titles(away.ui, status)).toEqual(titles(server.load(), status));
      expect(titles(here.ui, status)).toEqual(titles(server.load(), status));
    }
  });

  test("an echo of an older drag doesn't pull the card back", async () => {
    const server = await board(5);
    const tab = new Tab(server);
    tab.act({ type: "move", id: "ACT-5", to: "todo", before: "ACT-1" });
    const first = await tab.save();
    tab.act({ type: "move", id: "ACT-5", to: "todo", before: "ACT-4" });
    const second = await tab.save();
    tab.hear(first);
    expect(titles(tab.ui, "todo")).toEqual(["T1", "T2", "T3", "T5", "T4"]);
    tab.hear(second);
    expect(titles(tab.ui, "todo")).toEqual(titles(server.load(), "todo"));
  });

  test("an echo of a move to another column and back doesn't move the card", async () => {
    const server = await board(4);
    const tab = new Tab(server);
    // Alone in Done it keeps the position it had, so only the move back saves one
    tab.act({ type: "move", id: "ACT-1", to: "done", before: null, note: "moved it to Done" });
    const first = await tab.save();
    tab.act({ type: "move", id: "ACT-1", to: "todo", before: "ACT-3", note: "moved it to Todo" });
    await tab.save();
    tab.hear(first);
    expect(titles(tab.ui, "todo")).toEqual(["T2", "T1", "T3", "T4"]);
    expect(titles(tab.ui, "todo")).toEqual(titles(server.load(), "todo"));
  });
});
