import { describe, expect, test } from "bun:test";
import { FIRST, taskFrom } from "@/lib/board-load";
import { saveChanges } from "@/lib/board-save";
import { boardTotal, shelfCounts, shelvesFor, shelvesShown, shows, totalOf, type Shelf } from "@/lib/board-shelves";
import { boardReducer, newId, pageFrom, positionsFor, type BoardAction, type BoardState } from "@/lib/board-store";
import { apply, diffBoards, resolve, type Change, type Context } from "@/lib/board-sync";
import { demoReducer, initDemo } from "@/components/board-app/demo-state";
import { FakeBoardServer } from "./fake-server";

// A board reads only the shelves of tasks its view shows, the first page of each with the board and the rest after.
// What stays on the server still counts, and a board held in part must save, move cards and undo exactly as one
// held whole. These check that it does

const THEM = "33333333-3333-4333-8333-333333333333";
const ctx: Context = { prefix: "ACT", nameOf: () => "Them", page: (p) => pageFrom("Web", "web", p) };
const run = (s: BoardState, ...a: BoardAction[]) => a.reduce(boardReducer, s);
const key = (n: number) => `ACT-${n}`;

/** A board with this many tasks in each status, saved */
async function made(counts: Partial<Record<"todo" | "in_progress" | "done" | "canceled", number>>) {
  const server = new FakeBoardServer();
  const empty = server.load();
  const actions: BoardAction[] = [];
  for (const [status, n] of Object.entries(counts) as ["todo", number][])
    for (let i = 0; i < n; i++) actions.push({ type: "add", status, title: `${status} ${i + 1}` });
  const r = await saveChanges(empty, run(empty, ...actions), server.send, "ACT");
  expect(r.refused).toEqual([]);
  return server;
}

/** Reads the rest of a shelf as the board does, a page at a time, each page landing as a change */
function readOn(server: FakeBoardServer, from: BoardState, shelf: Shelf, size = 60) {
  let state = from;
  for (let pages = 0; pages < 100; pages++) {
    const gap = state.gaps?.[shelf];
    if (!gap) return state;
    const limit = gap.through ? size : FIRST;
    const rows = server.page(shelf, gap.through, limit);
    const last = rows.at(-1);
    state = apply(state, page(server, state, rows, shelf, last ? { position: last.position, number: last.number } : gap.through, rows.length < limit));
  }
  throw new Error("The shelf never ended");
}

function page(
  server: FakeBoardServer,
  state: BoardState,
  rows: ReturnType<FakeBoardServer["page"]>,
  shelf: Shelf,
  through: { position: number; number: number } | undefined,
  whole: boolean,
): Change {
  const tasks = rows.filter((r) => !state.tasks[key(r.number)]).map((r) => taskFrom("ACT", r, server.nameOf));
  return { kind: "held", tasks, shelf, through, whole };
}

describe("which shelves a view shows", () => {
  test("hiding done work leaves done and canceled on the server", () => {
    expect(shelvesShown({ filters: { hideDone: true } })).toEqual(["todo", "in_progress", "review"]);
  });

  test("a folded column or group isn't read", () => {
    expect(shelvesShown({ view: "board", collapsed: ["board:done"] })).not.toContain("done");
    expect(shelvesShown({ view: "table", collapsed: ["status:done", "status:todo"] })).toEqual([
      "in_progress",
      "review",
      "canceled",
    ]);
    expect(shelvesShown({ view: "roadmap", collapsed: ["t:status:canceled"] })).not.toContain("canceled");
    // Folds of another view, or another grouping, don't count
    expect(shelvesShown({ view: "table", collapsed: ["board:done"] })).toContain("done");
    expect(shelvesShown({ view: "table", grouping: "assignee", collapsed: ["status:done"] })).toContain("done");
  });

  test("a status filter reads only those statuses", () => {
    expect(shelvesShown({ filters: { status: ["review"] } })).toEqual(["review"]);
  });

  test("the archive is read when it's shown, and for the public roadmap", () => {
    expect(shelvesShown({})).not.toContain("archived");
    expect(shelvesShown({ filters: { archived: true } })).toContain("archived");
    const page = shelvesShown({ view: "public" });
    expect(page).toContain("archived");
    expect(page).toContain("backlog");
    expect(page).not.toContain("canceled");
  });

  test("a board opens with its saved filters, never ones left from last time", () => {
    expect(shelvesFor({ keptFilters: { hideDone: true }, filters: {} })).not.toContain("done");
    expect(shelvesFor({ filters: { hideDone: true } } as never)).toContain("done");
    expect(shelvesFor(null)).toEqual(["todo", "in_progress", "review", "done", "canceled"]);
  });
});

describe("a board held in part", () => {
  test("done hidden: done work isn't read, and still counts", async () => {
    const server = await made({ todo: 5, done: 250 });
    const board = server.loadShelves(shelvesShown({ filters: { hideDone: true } }));
    expect(Object.values(board.tasks).every((t) => t.status === "todo")).toBe(true);
    expect(board.gaps?.done?.rest).toBe(250);
    const counts = shelfCounts(board);
    expect(totalOf(counts.done)).toBe(250);
    expect(boardTotal(counts)).toBe(255);
  });

  test("a long shelf comes in pages, in board order, and ends the same as reading it whole", async () => {
    const server = await made({ todo: 5, done: 250, canceled: 3 });
    // Someone reorders done a little, so position and number disagree
    const whole = server.load();
    const moved = run(whole, { type: "move", id: whole.columns.done[200], to: "done", before: whole.columns.done[3] });
    await saveChanges(whole, moved, server.send, "ACT");

    const first = server.loadShelves(["todo", "in_progress", "review", "done", "canceled"]);
    expect(first.columns.done.length).toBe(FIRST);
    expect(first.gaps?.done?.through).toBeDefined();
    // Short shelves come whole with the board
    expect(first.gaps?.todo).toBeUndefined();
    expect(first.gaps?.canceled).toBeUndefined();

    const read = readOn(server, first, "done");
    const truth = server.load();
    expect(read.gaps?.done).toBeUndefined();
    expect(read.columns.done).toEqual(truth.columns.done);
    expect(Object.keys(read.tasks).sort()).toEqual(
      Object.keys(truth.tasks)
        .filter((id) => truth.tasks[id].status !== "backlog")
        .sort(),
    );
  });

  test("only as much of a shelf as has been read in order shows", async () => {
    const server = await made({ todo: 2, done: 150 });
    const first = server.loadShelves(["todo", "done"]);
    const shown = first.columns.done.filter((id) => shows(first.gaps, first.tasks[id]));
    expect(shown.length).toBe(FIRST);
    expect(shelfCounts(first).done).toMatchObject({ held: FIRST, shown: FIRST, rest: 50 });
  });

  test("saving never deletes what it didn't read", async () => {
    const server = await made({ todo: 4, done: 120 });
    const base = server.loadShelves(shelvesShown({ filters: { hideDone: true } }));
    const [a, b, c] = base.columns.todo;
    const edited = run(
      base,
      { type: "update", id: a, patch: { title: "Renamed" } },
      { type: "update", id: b, patch: { status: "done" }, note: "moved it to Done" },
      { type: "delete", ids: [c] },
    );
    expect(diffBoards(base, edited).deleted).toEqual([c]);
    const r = await saveChanges(base, edited, server.send, "ACT");
    expect(r.refused).toEqual([]);
    const after = server.load();
    expect(after.columns.done.length).toBe(121);
    expect(after.tasks[c]).toBeUndefined();
    expect(after.tasks[a].title).toBe("Renamed");
  });

  test("a card moved to a column that wasn't read goes to its true end", async () => {
    const server = await made({ todo: 3, done: 130 });
    const base = server.loadShelves(shelvesShown({ filters: { hideDone: true } }));
    const id = base.columns.todo[0];
    const edited = run(base, { type: "update", id, patch: { status: "done" }, note: "moved it to Done" });
    expect(edited.tasks[id].position!).toBeGreaterThan(base.gaps!.done!.tail!);
    await saveChanges(base, edited, server.send, "ACT");
    expect(server.load().columns.done.at(-1)).toBe(id);
  });

  test("a card dropped among the cards read stays where it was dropped", async () => {
    const server = await made({ todo: 2, done: 130 });
    const base = server.loadShelves(["todo", "done"]);
    const id = base.columns.todo[0];
    const before = base.columns.done[10];
    const edited = run(base, { type: "move", id, to: "done", before, note: "moved it to Done" });
    await saveChanges(base, edited, server.send, "ACT");
    const truth = server.load().columns.done;
    expect(truth.indexOf(id)).toBe(truth.indexOf(before) - 1);
  });

  test("undo after a page lands keeps the page, so a save deletes nothing", async () => {
    const server = await made({ todo: 2, done: 140 });
    let base = server.loadShelves(["todo", "done"]);
    let demo = initDemo(base);
    demo = demoReducer(demo, { type: "update", id: base.columns.todo[0], patch: { title: "Edited" } });
    const gap = base.gaps!.done!;
    const change = page(server, base, server.page("done", gap.through), "done", undefined, true);
    base = apply(base, change);
    demo = demoReducer(demo, { type: "rebase", current: (b) => apply(b, change), history: (b) => apply(b, change) });
    demo = demoReducer(demo, { type: "undo" });
    expect(Object.keys(demo.board.tasks).length).toBe(142);
    const d = diffBoards(base, demo.board);
    expect(d.deleted).toEqual([]);
    expect(d.created).toEqual([]);
  });

  test("a task the Inbox needs comes early, out of sight, and counts once", async () => {
    const server = await made({ todo: 2, done: 150 });
    const truth = server.load();
    const late = truth.columns.done[140];
    server.activity.push({ id: newId(), number: Number(late.slice(4)), actor: THEM, text: "commented", created_at: server.now() });
    const board = server.loadShelves(shelvesShown({ filters: { hideDone: true } }));
    expect(board.tasks[late]).toBeDefined();
    expect(shows(board.gaps, board.tasks[late])).toBe(false);
    expect(totalOf(shelfCounts(board).done)).toBe(150);
    // Reading the shelf later passes it over, and it shows in its place
    const read = readOn(server, board, "done");
    expect(read.columns.done).toEqual(truth.columns.done);
  });

  test("a task someone changes on a shelf not read joins it, and the count stays right", async () => {
    const server = await made({ todo: 2, done: 150 });
    const board = server.loadShelves(shelvesShown({ filters: { hideDone: true } }));
    const row = server.page("done", undefined, 1)[0];
    const edit = apply(board, resolve(board, { table: "tasks", row: { ...row, title: "Changed by them" } }, ctx));
    expect(edit.tasks[key(row.number)].title).toBe("Changed by them");
    expect(totalOf(shelfCounts(edit).done)).toBe(150);
    // A task just made adds one
    const fresh = { ...row, number: 999, title: "New" };
    const added = apply(edit, resolve(edit, { table: "tasks", row: fresh, fresh: true }, ctx));
    expect(totalOf(shelfCounts(added).done)).toBe(151);
  });

  test("a page never replaces a task already held", async () => {
    const server = await made({ todo: 1, done: 130 });
    const board = server.loadShelves(["todo", "done"]);
    const id = board.columns.done[0];
    const ours = run(board, { type: "update", id, patch: { title: "Ours" } });
    const rows = server.page("done", undefined, 130);
    const next = apply(ours, { kind: "held", tasks: rows.map((r) => taskFrom("ACT", r, server.nameOf)), shelf: "done", whole: true });
    expect(next.tasks[id].title).toBe("Ours");
    expect(next.columns.done.length).toBe(130);
    expect(new Set(next.columns.done).size).toBe(130);
  });

  test("a count reading low never closes a gap, as only reading a shelf to its end shows it's whole", async () => {
    const server = await made({ todo: 1, done: 130 });
    const board = server.loadShelves(["todo"]);
    const counted = apply(board, { kind: "gaps", gaps: { done: { rest: 0, tail: 3 } } });
    expect(counted.gaps?.done).toMatchObject({ rest: 0, tail: 3 });
  });

  test("without the shelves migration nothing is known of the shelves not read", async () => {
    const server = await made({ todo: 2, done: 40 });
    const board = server.loadShelves(["todo"], { counts: false });
    expect(board.gaps?.done).toEqual({ rest: undefined, tail: undefined, through: undefined });
    expect(boardTotal(shelfCounts(board))).toBeUndefined();
  });
});

describe("positions in a column held in part", () => {
  test("a card at the end goes after the last card not held", () => {
    const cards = [
      { number: 1, position: 0 },
      { number: 2, position: 1 },
      { number: 3, position: 0.5, moved: true },
    ];
    const [, , p] = positionsFor(cards, 40);
    expect(p).toBeGreaterThan(40);
  });

  test("a card already past the last one keeps its place", () => {
    const cards = [
      { number: 1, position: 0 },
      { number: 3, position: 41, moved: true },
    ];
    expect(positionsFor(cards, 40)).toEqual([0, 41]);
  });

  test("a card dropped between two others stays between them", () => {
    const cards = [
      { number: 1, position: 0 },
      { number: 3, position: 99, moved: true },
      { number: 2, position: 1 },
    ];
    const [, p] = positionsFor(cards, 40);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });
});
