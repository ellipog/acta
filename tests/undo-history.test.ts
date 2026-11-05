import { afterAll, beforeAll, expect, setSystemTime, spyOn, test } from "bun:test";
import { boardReducer, seedBoard, statuses, type BoardAction, type BoardState, type Task } from "@/lib/board-store";
import { apply, dropGone, renumber, type Change } from "@/lib/board-sync";
import { demoReducer, describe, initDemo, type Catch, type Demo, type DemoAction } from "@/components/board-app/demo-state";

// The undo history used to bring every board in it up to date as each change from someone else arrived. Now a
// board in the history takes those changes on only when undo or redo brings it back. These run long mixes of edits,
// changes from others, undo and redo through both ways, and check that every undo and redo lands on the same board

// The undo history as it worked before, kept here to compare against
type OldStep = { board: BoardState; label: string };
type Old = { board: BoardState; past: OldStep[]; future: OldStep[] };
type Step =
  | { type: "edit"; action: BoardAction }
  | { type: "remote"; current: (b: BoardState) => BoardState; history?: Catch | null }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "undoTo"; depth: number }
  | { type: "checkpoint"; label: string }
  | { type: "revert" };

function oldReducer(demo: Old, step: Step): Old {
  switch (step.type) {
    case "checkpoint":
      return { ...demo, past: [...demo.past, { board: demo.board, label: step.label }].slice(-100), future: [] };
    case "revert": {
      const last = demo.past.at(-1);
      return last ? { ...demo, board: last.board, past: demo.past.slice(0, -1) } : demo;
    }
    case "undo": {
      const last = demo.past.at(-1);
      if (!last) return demo;
      return {
        board: last.board,
        past: demo.past.slice(0, -1),
        future: [{ board: demo.board, label: last.label }, ...demo.future],
      };
    }
    case "redo": {
      const next = demo.future[0];
      if (!next) return demo;
      return {
        board: next.board,
        past: [...demo.past, { board: demo.board, label: next.label }],
        future: demo.future.slice(1),
      };
    }
    case "undoTo":
      return demo.past.length === step.depth + 1 ? oldReducer(demo, { type: "undo" }) : demo;
    case "remote": {
      const history = step.history === undefined ? (b: BoardState) => b : step.history === null ? () => null : step.history;
      const move = (steps: OldStep[]) => {
        let out: OldStep[] | null = null;
        for (let i = 0; i < steps.length; i++) {
          const b = history(steps[i].board);
          if (!b) return [];
          if (b === steps[i].board && !out) continue;
          out ??= steps.slice(0, i);
          out.push(b === steps[i].board ? steps[i] : { ...steps[i], board: b });
        }
        return out ?? steps;
      };
      return { board: step.current(demo.board), past: move(demo.past), future: move(demo.future) };
    }
    case "edit": {
      const board = boardReducer(demo.board, step.action);
      if (board === demo.board) return demo;
      const label = describe(step.action, demo.board);
      if (step.action.type === "page" && demo.past.at(-1)?.label === label) return { ...demo, board, future: [] };
      return { board, past: [...demo.past, { board: demo.board, label }].slice(-100), future: [] };
    }
  }
}

const toAction = (step: Step): DemoAction =>
  step.type === "edit"
    ? step.action
    : step.type === "remote"
      ? { type: "rebase", current: step.current, history: step.history }
      : step;

// Tasks get random ids and times as they change, so both ways get the same ones
let ids = 0;
beforeAll(() => {
  setSystemTime(new Date("2026-11-05T12:00:00Z"));
  spyOn(crypto, "randomUUID").mockImplementation(() => `00000000-0000-4000-8000-${String(ids++).padStart(12, "0")}`);
});
afterAll(() => setSystemTime());

function both(demo: Demo, old: Old, step: Step, at: number): [Demo, Old] {
  ids = at * 1000;
  const next = demoReducer(demo, toAction(step));
  ids = at * 1000;
  return [next, oldReducer(old, step)];
}

// Every board undo and redo would bring back, by undoing all the way and redoing all the way
function history(demo: Demo) {
  const boards: BoardState[] = [];
  let d = demo;
  while (d.past.length) boards.push((d = demoReducer(d, { type: "undo" })).board);
  while (d.future.length) boards.push((d = demoReducer(d, { type: "redo" })).board);
  return boards;
}
function oldHistory(old: Old) {
  const boards: BoardState[] = [];
  let d = old;
  while (d.past.length) boards.push((d = oldReducer(d, { type: "undo" })).board);
  while (d.future.length) boards.push((d = oldReducer(d, { type: "redo" })).board);
  return boards;
}

function same(demo: Demo, old: Old) {
  expect(demo.board).toEqual(old.board);
  expect(demo.past.map((s) => s.label)).toEqual(old.past.map((s) => s.label));
  expect(demo.future.map((s) => s.label)).toEqual(old.future.map((s) => s.label));
}

// A small random number source, so a failing mix can be run again
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(seed: number, length: number) {
  const r = random(seed);
  const pick = <T>(list: T[]) => list[Math.floor(r() * list.length)];
  let demo = initDemo(seedBoard());
  let old: Old = { board: demo.board, past: [], future: [] };
  let comments: string[] = [];
  // The board as the server last confirmed it, which both ways share, as the live feed's own copy is shared
  let base = demo.board;

  for (let at = 0; at < length; at++) {
    const board = old.board;
    const tasks = Object.keys(board.tasks);
    const id = pick(tasks);
    const roll = r();
    let step: Step;
    if (roll < 0.3) {
      const kind = r();
      step = {
        type: "edit",
        action:
          kind < 0.4
            ? { type: "update", id, patch: { title: `Mine ${at}` } }
            : kind < 0.55
              ? { type: "update", id, patch: { status: pick(statuses).id } }
              : kind < 0.7
                ? { type: "add", status: "todo", title: `New ${at}` }
                : kind < 0.8
                  ? { type: "delete", ids: [id] }
                  : kind < 0.9
                    ? { type: "page", patch: { title: `Page ${at}` } }
                    : { type: "comment", id, body: `Said ${at}` },
      };
    } else if (roll < 0.75) {
      // Someone else's change, as the live feed hands it over
      const kind = r();
      let change: Change;
      if (kind < 0.35) change = { kind: "task", id, fields: { title: `Theirs ${at}` } };
      else if (kind < 0.5) change = { kind: "task", id, fields: { status: pick(statuses).id, position: Math.floor(r() * 4) } };
      else if (kind < 0.62) {
        const n = board.next + Math.floor(r() * 3);
        const task: Task = { ...board.tasks[id], id: `ACT-${n}`, title: `Added ${at}`, comments: 0, thread: [], activity: [] };
        change = { kind: "task", id: task.id, add: { ...task, position: Math.floor(r() * 3) } };
      } else if (kind < 0.7) change = { kind: "task", id, remove: true };
      else if (kind < 0.82) {
        const comment = { id: `c-${at}`, who: "Someone", at, body: `Heard ${at}` };
        comments = [...comments, comment.id];
        change = { kind: "comment", task: id, comment };
      } else change = { kind: "board", page: { ...board.roadmap.page, title: `Their page ${at}` }, next: board.next + 1 };
      // Like the live feed, the board on screen keeps changes of its own that haven't saved yet
      const pending = r() < 0.5 ? base : undefined;
      base = apply(base, change);
      if (r() < 0.06) {
        const to = `ACT-${board.next + 5}`;
        step = { type: "remote", current: (b) => renumber(b, id, to), history: (b) => renumber(b, id, to) };
      } else if (r() < 0.04 && comments.length) {
        const gone = { comments: new Set([pick(comments)]), activity: new Set<string>(), suggestions: new Set<string>() };
        step = { type: "remote", current: (b) => dropGone(b, gone), history: (b) => dropGone(b, gone) };
      } else if (r() < 0.02) step = { type: "remote", current: (b) => apply(b, change), history: null };
      else if (r() < 0.04) step = { type: "remote", current: (b) => apply(b, change, pending) };
      else step = { type: "remote", current: (b) => apply(b, change, pending), history: (b) => apply(b, change) };
    } else if (roll < 0.86) step = { type: "undo" };
    else if (roll < 0.95) step = { type: "redo" };
    else if (roll < 0.97) step = { type: "undoTo", depth: Math.max(0, old.past.length - 1 - Math.floor(r() * 2)) };
    else if (roll < 0.99) step = { type: "checkpoint", label: `Checkpoint ${at}` };
    else step = { type: "revert" };

    [demo, old] = both(demo, old, step, at);
    same(demo, old);
    if (at % 25 === 0) expect(history(demo)).toEqual(oldHistory(old));
  }
  expect(history(demo)).toEqual(oldHistory(old));
  return demo;
}

test("undo and redo land on the same boards as when the history was rewritten with each change", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) mix(seed, 400);
});

test("a long history past its limit still undoes to the same boards", () => {
  // Mostly edits, so the history fills to its limit and its oldest steps fall away
  const demo = mix(42, 1200);
  expect(demo.past.length + demo.future.length).toBeGreaterThan(0);
});

test("a board brought back by undo has what others changed while it waited", () => {
  let demo = initDemo(seedBoard());
  const [mine, theirs] = Object.keys(demo.board.tasks);
  const was = demo.board.tasks[mine].title;
  demo = demoReducer(demo, { type: "update", id: mine, patch: { title: "Renamed by me" } });
  const change: Change = { kind: "task", id: theirs, fields: { title: "Renamed by them" } };
  demo = demoReducer(demo, { type: "rebase", current: (b) => apply(b, change), history: (b) => apply(b, change) });
  demo = demoReducer(demo, { type: "undo" });
  expect(demo.board.tasks[mine].title).toBe(was);
  expect(demo.board.tasks[theirs].title).toBe("Renamed by them");
  demo = demoReducer(demo, { type: "redo" });
  expect(demo.board.tasks[mine].title).toBe("Renamed by me");
  expect(demo.board.tasks[theirs].title).toBe("Renamed by them");
});

test("a change that changes nothing keeps the whole state", () => {
  const demo = initDemo(seedBoard());
  const keep = (b: BoardState) => b;
  expect(demoReducer(demo, { type: "rebase", current: keep, history: keep })).toBe(demo);
  expect(demoReducer(demo, { type: "rebase", current: keep, history: null })).toBe(demo);
  const edited = demoReducer(demo, { type: "update", id: Object.keys(demo.board.tasks)[0], patch: { title: "Edited" } });
  expect(demoReducer(edited, { type: "rebase", current: keep })).toBe(edited);
});

test("the history lets go of changes once no board in it needs them", () => {
  let demo = initDemo(seedBoard());
  const id = Object.keys(demo.board.tasks)[0];
  demo = demoReducer(demo, { type: "update", id, patch: { title: "One" } });
  for (let i = 0; i < 50; i++) {
    const change: Change = { kind: "task", id, fields: { priority: i % 2 ? "high" : "low" } };
    demo = demoReducer(demo, { type: "rebase", current: (b) => apply(b, change), history: (b) => apply(b, change) });
  }
  expect(demo.missed.length).toBe(50);
  // Undoing the only edit leaves one board in the history, the one undo just left, which needs none of them
  demo = demoReducer(demo, { type: "undo" });
  expect(demo.missed.length).toBe(0);
  // A resync forgets the history, and the changes with it
  demo = demoReducer(demo, { type: "redo" });
  demo = demoReducer(demo, { type: "update", id, patch: { title: "Two" } });
  const change: Change = { kind: "task", id, fields: { priority: "urgent" } };
  demo = demoReducer(demo, { type: "rebase", current: (b) => apply(b, change), history: (b) => apply(b, change) });
  demo = demoReducer(demo, { type: "rebase", current: (b) => b, history: null });
  expect([demo.past.length, demo.future.length, demo.missed.length]).toEqual([0, 0, 0]);
});
