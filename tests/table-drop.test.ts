import { expect, test } from "bun:test";
import { boardReducer, statuses, type BoardAction, type BoardState, type Task } from "@/lib/board-store";
import { planDrop, planStep, type DropGroup } from "@/components/board-app/table-drop";
import { FakeBoardServer } from "./fake-server";

// Dragging rows in the table. The table groups tasks by any field, but their order lives in the board's status
// columns, so each drop has to land in the column where the person would expect it from what they saw

const run = (s: BoardState, ...a: BoardAction[]) => a.reduce(boardReducer, s);

function board() {
  const s = new FakeBoardServer().load();
  return run(
    s,
    { type: "add", status: "todo", title: "One" },
    { type: "add", status: "todo", title: "Two" },
    { type: "add", status: "todo", title: "Three" },
    { type: "add", status: "review", title: "Four" },
    { type: "update", id: "ACT-2", patch: { priority: "high" } },
    { type: "update", id: "ACT-4", patch: { priority: "high" } },
  );
}

// The same groups the table builds: rows in board order, filtered, then split by the field
function byStatus(s: BoardState, hidden: string[] = []): DropGroup[] {
  return statuses.map((st) => ({
    key: `status:${st.id}`,
    rows: s.columns[st.id].map((id) => s.tasks[id]).filter((t) => !hidden.includes(t.id)),
    patch: { status: st.id },
    note: `moved it to ${st.title}`,
  }));
}

function byPriority(s: BoardState): DropGroup[] {
  const rows = statuses.flatMap((st) => s.columns[st.id].map((id) => s.tasks[id]));
  return (["high", "none"] as const).map((p) => ({
    key: `priority:${p}`,
    rows: rows.filter((t: Task) => t.priority === p),
    patch: { priority: p },
    note: `set the priority to ${p}`,
  }));
}

function drop(s: BoardState, groups: DropGroup[], id: string, group: string, index: number) {
  const action = planDrop(s, groups, id, { group, index });
  return action ? boardReducer(s, action) : s;
}

test("dragging to the top of its own group moves it first", () => {
  const s = board();
  const after = drop(s, byStatus(s), "ACT-3", "status:todo", 0);
  expect(after.columns.todo).toEqual(["ACT-3", "ACT-1", "ACT-2"]);
});

test("dragging to the end of its own group moves it last", () => {
  const s = board();
  const after = drop(s, byStatus(s), "ACT-1", "status:todo", 3);
  expect(after.columns.todo).toEqual(["ACT-2", "ACT-3", "ACT-1"]);
});

test("dropping a row where it already is changes nothing", () => {
  const s = board();
  expect(drop(s, byStatus(s), "ACT-2", "status:todo", 1)).toBe(s);
  expect(drop(s, byStatus(s), "ACT-2", "status:todo", 2)).toBe(s);
});

test("dragging into another status group changes its status and places it", () => {
  const s = board();
  const after = drop(s, byStatus(s), "ACT-1", "status:review", 0);
  expect(after.tasks["ACT-1"].status).toBe("review");
  expect(after.columns.todo).toEqual(["ACT-2", "ACT-3"]);
  expect(after.columns.review).toEqual(["ACT-1", "ACT-4"]);
  expect(after.tasks["ACT-1"].activity.at(-1)?.text).toContain("moved it to");
});

test("dragging into an empty group works", () => {
  const s = board();
  const after = drop(s, byStatus(s), "ACT-3", "status:in_progress", 0);
  expect(after.tasks["ACT-3"].status).toBe("in_progress");
  expect(after.columns.in_progress).toEqual(["ACT-3"]);
});

test("rows hidden by a filter keep their place around the dropped one", () => {
  const s = board();
  // ACT-2 is filtered out. Dropping ACT-3 just below ACT-1 puts it between ACT-1 and the hidden ACT-2
  const after = drop(s, byStatus(s, ["ACT-2"]), "ACT-3", "status:todo", 1);
  expect(after.columns.todo).toEqual(["ACT-1", "ACT-3", "ACT-2"]);
});

test("dragging between groups of another field sets that field and keeps the status", () => {
  const s = board();
  // The high group shows ACT-2 (todo) then ACT-4 (review). Dropping ACT-3 above ACT-2 makes it high, just before
  // ACT-2 on the board. ACT-1 isn't in the group, so it stays where it was
  const after = drop(s, byPriority(s), "ACT-3", "priority:high", 0);
  expect(after.tasks["ACT-3"].priority).toBe("high");
  expect(after.tasks["ACT-3"].status).toBe("todo");
  expect(after.columns.todo).toEqual(["ACT-1", "ACT-3", "ACT-2"]);
});

test("a drop that can't move it among rows of its status leaves its board place alone", () => {
  const s = board();
  // ACT-4 is the only review task in the high group, so above or below ACT-2 looks the same in the table
  const g = byPriority(s);
  expect(drop(s, g, "ACT-4", "priority:high", 0)).toBe(s);
});

test("Alt with the arrows moves one row at a time and stops at the ends", () => {
  const s = board();
  const g = byStatus(s);
  const down = planStep(s, g, "ACT-1", 1);
  expect(down && boardReducer(s, down).columns.todo).toEqual(["ACT-2", "ACT-1", "ACT-3"]);
  const up = planStep(s, g, "ACT-3", -1);
  expect(up && boardReducer(s, up).columns.todo).toEqual(["ACT-1", "ACT-3", "ACT-2"]);
  expect(planStep(s, g, "ACT-1", -1)).toBeNull();
  expect(planStep(s, g, "ACT-3", 1)).toBeNull();
});

test("a move only changes what it needs to", () => {
  const s = board();
  const after = boardReducer(s, { type: "move", id: "ACT-2", to: "todo", before: "ACT-1" });
  expect(after.tasks["ACT-2"]).toBe(s.tasks["ACT-2"]);
  expect(after.columns.review).toBe(s.columns.review);
  expect(after.columns.todo).toEqual(["ACT-2", "ACT-1", "ACT-3"]);
});
