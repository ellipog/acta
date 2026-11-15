import { describe, expect, test } from "bun:test";
import { saveChanges } from "@/lib/board-save";
import { boardReducer, pageFrom, type BoardAction, type BoardState } from "@/lib/board-store";
import {
  apply,
  applySteps,
  diffBoards,
  renumber,
  resolve,
  SentLog,
  type Context,
  type RemoteEvent,
  type Step,
} from "@/lib/board-sync";
import { demoReducer, initDemo, type Catch, type Demo } from "@/components/board-app/demo-state";
import { FakeBoardServer } from "./fake-server";

// Changes from others used to be applied and drawn one live message at a time. They're now applied together, a
// frame's worth at once (see applyIncoming in use-board-sync.ts). These check a batch leaves what's saved, what's on
// screen, undo and the next save exactly as taking them one by one did, and that a task the screen holds as saved
// ends up the same object in both copies

const ctx: Context = { prefix: "ACT", nameOf: () => "Someone", page: (p) => pageFrom("Web", "web", p) };
const run = (s: BoardState, ...a: BoardAction[]) => a.reduce(boardReducer, s);

class Tab {
  base: BoardState;
  demo: Demo;
  sent = new SentLog();
  constructor(start: BoardState) {
    this.base = start;
    this.demo = initDemo(start);
  }
  /** Another copy of this tab, the same in every way */
  copy() {
    const t = new Tab(this.base);
    t.demo = structuredClone(this.demo);
    return t;
  }
  get ui() {
    return this.demo.board;
  }
  act(...actions: (BoardAction | { type: "undo" } | { type: "redo" })[]) {
    for (const a of actions) this.demo = demoReducer(this.demo, a);
    return this;
  }
  /** The old way: each change applied and dispatched on its own */
  hearEach(events: RemoteEvent[]) {
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
  /** The new way: every change applied to what's saved in turn, and to the screen in one dispatch */
  hearBatch(events: RemoteEvent[]) {
    const steps: (Step & { history: Catch })[] = [];
    for (const ev of events) {
      const before = this.base;
      const change = this.sent.screen(resolve(before, ev, ctx));
      if (change.kind === "none") continue;
      this.base = apply(before, change);
      const id = change.kind === "task" ? change.id : undefined;
      const was = id ? before.tasks[id] : undefined;
      const now = id ? this.base.tasks[id] : undefined;
      steps.push({
        current: (b) => apply(b, change, before),
        history: (b) => apply(b, change),
        share: id && was && now && now !== was ? { id, was, now } : undefined,
      });
    }
    this.demo = demoReducer(this.demo, {
      type: "rebase",
      current: (b) => applySteps(b, steps),
      history: (b) => steps.reduce((s, step) => step.history(s), b),
    });
    return this;
  }
}

const feed = (server: FakeBoardServer, from: number): RemoteEvent[] =>
  server.writes.slice(from).map((n) => ({ table: "tasks", row: structuredClone(server.tasks.get(n)!) }));

async function setup() {
  const server = new FakeBoardServer();
  const empty = server.load();
  const adds: BoardAction[] = Array.from({ length: 40 }, (_, i) => ({ type: "add", status: "todo", title: `T${i + 1}` }));
  await saveChanges(empty, run(empty, ...adds), server.send, "ACT");
  server.writes = [];
  // Where the tabs below start, before anyone else changes anything
  const start = server.load();
  // Someone else, an agent say, changes half the board in one go
  const agent = server.load();
  const ids = agent.columns.todo;
  const theirs = run(
    agent,
    { type: "bulk", ids: ids.slice(0, 10), patch: { status: "done" }, note: "closed" },
    { type: "bulk", ids: ids.slice(10, 20), patch: { priority: "high" }, note: "prioritised" },
    { type: "move", id: ids[25], to: "todo", before: ids[0] },
    { type: "add", status: "in_progress", title: "New from them" },
  );
  const from = server.writes.length;
  await saveChanges(agent, theirs, server.send, "ACT");
  return { start, ids, events: feed(server, from) };
}

describe("live changes applied in a batch", () => {
  test("what's saved, what's on screen, undo and the next save match taking them one by one", async () => {
    const { start, ids, events } = await setup();
    // Two copies of the same tab, each with edits of its own not saved yet and a step to undo
    const mine: BoardAction[] = [
      { type: "update", id: ids[2], patch: { title: "Mine" }, note: "renamed the task" },
      { type: "move", id: ids[12], to: "review", before: null },
      { type: "update", id: ids[30], patch: { priority: "urgent" } },
    ];
    const one = new Tab(start).act(...mine);
    const all = one.copy();
    one.hearEach(events);
    all.hearBatch(events);

    expect(all.base).toEqual(one.base);
    expect(all.ui).toEqual(one.ui);
    expect(diffBoards(all.base, all.ui)).toEqual(diffBoards(one.base, one.ui));
    // Undo goes back over the same changes
    all.act({ type: "undo" });
    one.act({ type: "undo" });
    expect(all.ui).toEqual(one.ui);
  });

  test("a task the screen held as saved is the same object in both copies afterwards", async () => {
    const { start, ids, events } = await setup();
    const tab = new Tab(start).act({ type: "update", id: ids[2], patch: { title: "Mine" } }).hearBatch(events);
    // Closed and prioritised by them, untouched here
    for (const id of [ids[0], ids[5], ids[15]]) expect(tab.ui.tasks[id]).toBe(tab.base.tasks[id]);
    // Edited here and not saved: the screen keeps its own copy, with the title it has
    expect(tab.ui.tasks[ids[2]]).not.toBe(tab.base.tasks[ids[2]]);
    expect(tab.ui.tasks[ids[2]].title).toBe("Mine");
    expect(tab.ui.tasks[ids[2]].status).toBe("done");
  });

  test("a task of ours that a new one of theirs takes the number of moves on, as before", async () => {
    const { start, events } = await setup();
    const tab = new Tab(start);
    const free = tab.ui.next;
    // A task made here, not saved, with the number their new task has
    tab.act({ type: "add", status: "todo", title: "Ours" });
    const ours = `ACT-${free}`;
    expect(tab.ui.tasks[ours]?.title).toBe("Ours");
    const theirs = events.find((e) => e.table === "tasks" && e.row.title === "New from them");
    expect(theirs && theirs.table === "tasks" && theirs.row.number).toBe(free);
    // The hook renumbers ours first, in the same dispatch, then applies theirs
    const to = `ACT-${free + 1}`;
    tab.demo = demoReducer(tab.demo, { type: "rebase", current: (s) => renumber(s, ours, to), history: (s) => renumber(s, ours, to) });
    tab.hearBatch(events);
    expect(tab.ui.tasks[to]?.title).toBe("Ours");
    expect(tab.ui.tasks[ours]?.title).toBe("New from them");
  });
});
