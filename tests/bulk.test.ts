import { describe, expect, test } from "bun:test";
import { boardReducer, seedBoard, type BoardAction, type BoardState, type Task } from "@/lib/board-store";

// A change to several tasks copies the board once rather than once a task. These check it still comes out the same
// as making the change to each task in turn, columns, positions and the activity it logs included

const run = (s: BoardState, ...a: BoardAction[]) => a.reduce(boardReducer, s);
const bulk = (a: Extract<BoardAction, { type: "bulk" }>) => a;

// Activity lines get fresh ids and times, and closing a task stamps the time, so those compare by what they say
const plain = (t: Task) => ({ ...t, activity: t.activity.map((a) => a.text), closed: Boolean(t.closed) });
const view = (s: BoardState) => ({
  columns: s.columns,
  tasks: Object.fromEntries(Object.entries(s.tasks).map(([id, t]) => [id, plain(t)])),
});

function oneByOne(s: BoardState, action: Extract<BoardAction, { type: "bulk" }>) {
  return run(
    s,
    ...action.ids.map((id): BoardAction => {
      const own = action.each?.[id];
      return {
        type: "update",
        id,
        patch: { ...action.patch, ...own?.patch },
        note: own && "note" in own ? own.note : action.note,
      };
    }),
  );
}

describe("bulk", () => {
  const board = seedBoard();
  const todo = board.columns.todo;
  const doing = board.columns.in_progress;

  test("moving tasks to another column matches updating them one by one", () => {
    const action = bulk({ type: "bulk", ids: [...todo.slice(0, 3), ...doing.slice(0, 2)], patch: { status: "done" }, note: "moved it to Done" });
    const together = run(board, action);
    expect(view(together)).toEqual(view(oneByOne(board, action)));
    // They join the end of Done in the order given
    expect(together.columns.done.slice(-5)).toEqual(action.ids);
    expect(together.columns.todo).not.toContain(todo[0]);
  });

  test("a card a drag already put in its new column stays where it was dropped", () => {
    const dropped: BoardState = {
      ...board,
      columns: { ...board.columns, done: [todo[0], ...board.columns.done] },
    };
    const action = bulk({ type: "bulk", ids: [todo[0], todo[1]], patch: { status: "done" }, note: "moved it to Done" });
    const together = run(dropped, action);
    expect(view(together)).toEqual(view(oneByOne(dropped, action)));
    expect(together.columns.done[0]).toBe(todo[0]);
  });

  test("fields that don't move a card, archiving included, match too", () => {
    for (const patch of [{ priority: "high" }, { archived: new Date().toISOString() }, { labels: ["bug"] }] as Partial<Task>[]) {
      const action = bulk({ type: "bulk", ids: [...todo, ...doing], patch, note: "edited" });
      expect(view(run(board, action))).toEqual(view(oneByOne(board, action)));
    }
  });

  test("each task can add to the change and log its own note, or none", () => {
    const [a, b, c] = todo;
    const action: Extract<BoardAction, { type: "bulk" }> = {
      type: "bulk",
      ids: [a, b, c],
      patch: { labels: ["bug"] },
      note: "set labels",
      each: { [a]: { note: "added label bug" }, [b]: { note: undefined }, [c]: { patch: { priority: "urgent" } } },
    };
    const together = run(board, action);
    expect(view(together)).toEqual(view(oneByOne(board, action)));
    expect(together.tasks[a].activity.at(-1)?.text).toBe("added label bug");
    expect(together.tasks[b].activity).toEqual(board.tasks[b].activity);
    expect(together.tasks[c].priority).toBe("urgent");
  });

  test("ids that aren't on the board change nothing", () => {
    expect(run(board, { type: "bulk", ids: ["ACT-99999"], patch: { priority: "high" }, note: "x" })).toBe(board);
  });

  test("a task named twice is changed twice but moved once", () => {
    const action = bulk({ type: "bulk", ids: [todo[0], todo[0]], patch: { status: "review" }, note: "moved it" });
    const together = run(board, action);
    expect(view(together)).toEqual(view(oneByOne(board, action)));
    expect(together.columns.review.filter((id) => id === todo[0])).toHaveLength(1);
  });
});
