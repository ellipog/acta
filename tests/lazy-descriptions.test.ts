import { describe, expect, test } from "bun:test";
import { saveChanges } from "@/lib/board-save";
import { boardReducer, pageFrom, type BoardAction, type BoardState } from "@/lib/board-store";
import { taskFrom } from "@/lib/board-load";
import {
  apply,
  diffBoards,
  emptyDiff,
  resolve,
  unreadBack,
  type Context,
  type TaskRow,
} from "@/lib/board-sync";
import { FakeBoardServer } from "./fake-server";

// A board arrives without its tasks' descriptions, which can be most of its size, and a task's dialog reads its
// description with its thread. Until then the task holds an empty one, which must never show as the real one, be
// saved over it, or be mistaken for an edit

const ctx: Context = { prefix: "ACT", nameOf: () => "Them", page: (p) => pageFrom("Web", "web", p) };
const run = (s: BoardState, ...a: BoardAction[]) => a.reduce(boardReducer, s);
const WORDS = "Why it matters, and what done looks like.";

// ACT-1 with a description, ACT-2 without, as a fresh visit reads them
async function visit() {
  const server = new FakeBoardServer();
  const empty = server.load();
  const made = run(
    empty,
    { type: "add", status: "todo", title: "Write the brief", patch: { description: WORDS, public: true } },
    { type: "add", status: "done", title: "Sketch", patch: { public: true } },
  );
  const saved = await saveChanges(empty, made, server.send, "ACT");
  expect(saved.refused).toEqual([]);
  return { server, base: server.load() };
}

// A row as the live feed or catching up brings it, whole, or as a read that leaves the description out
const rowOf = (server: FakeBoardServer, number: number, patch: Partial<TaskRow> = {}) =>
  ({ ...structuredClone(server.tasks.get(number)!), ...patch }) as unknown as TaskRow;

describe("a board as it arrives", () => {
  test("holds no description, and says so", async () => {
    const { base } = await visit();
    for (const id of ["ACT-1", "ACT-2"]) {
      expect(base.tasks[id].description).toBe("");
      expect(base.tasks[id].brief).toBe(true);
    }
  });

  test("reading a task's thread brings its description", async () => {
    const { server, base } = await visit();
    const read = apply(base, server.thread("ACT-1", base)).tasks["ACT-1"];
    expect(read.description).toBe(WORDS);
    expect(read.brief).toBeUndefined();
    // A task with none has an empty one, now known to be empty
    const other = apply(base, server.thread("ACT-2", base)).tasks["ACT-2"];
    expect(other.description).toBe("");
    expect(other.brief).toBeUndefined();
  });

  test("a description read is no edit, either way round", async () => {
    const { server, base } = await visit();
    const read = apply(base, server.thread("ACT-1", base));
    expect(emptyDiff(diffBoards(base, read))).toBe(true);
    expect(emptyDiff(diffBoards(read, base))).toBe(true);
  });

  test("a read never goes over a description this copy holds, which can have an edit not saved yet", async () => {
    const { server, base } = await visit();
    const read = apply(base, server.thread("ACT-1", base));
    const edited = run(read, { type: "update", id: "ACT-1", patch: { description: "Mine, not saved" } });
    const again = apply(edited, server.thread("ACT-1", read));
    expect(again.tasks["ACT-1"].description).toBe("Mine, not saved");
  });
});

describe("live and caught-up rows", () => {
  test("a row without its description leaves the one held alone", async () => {
    const { server, base } = await visit();
    const read = apply(base, server.thread("ACT-1", base));
    const change = resolve(read, { table: "tasks", row: rowOf(server, 1, { description: undefined, title: "Renamed" }) }, ctx);
    const after = apply(read, change).tasks["ACT-1"];
    expect(after.title).toBe("Renamed");
    expect(after.description).toBe(WORDS);
  });

  test("a whole row brings the description of a task that hadn't read it", async () => {
    const { server, base } = await visit();
    const after = apply(base, resolve(base, { table: "tasks", row: rowOf(server, 1) }, ctx)).tasks["ACT-1"];
    expect(after.description).toBe(WORDS);
    expect(after.brief).toBeUndefined();
  });

  test("a task new to this copy, without its description, says it hasn't read it", async () => {
    const { server, base } = await visit();
    const without = { ...base, tasks: { ...base.tasks } };
    delete without.tasks["ACT-1"];
    const change = resolve(without, { table: "tasks", row: rowOf(server, 1, { description: undefined }) }, ctx);
    expect(apply(without, change).tasks["ACT-1"].brief).toBe(true);
  });
});

describe("a task brought back by undo", () => {
  test("waits for its description before it's saved, so the empty one can't go over it", async () => {
    const { server, base } = await visit();
    const gone = run(base, { type: "delete", ids: ["ACT-1"] });
    const saved = await saveChanges(base, gone, server.send, "ACT");
    expect(saved.refused).toEqual([]);
    // Undo puts the task back as it was held: without its description
    const back = { ...gone, tasks: { ...gone.tasks, "ACT-1": base.tasks["ACT-1"] }, columns: base.columns };
    expect(unreadBack(diffBoards(saved.base, back), back)).toEqual(["ACT-1"]);
    // Once its description is read, it goes back whole
    const read = apply(back, server.thread("ACT-1", back));
    expect(unreadBack(diffBoards(saved.base, read), read)).toEqual([]);
    await saveChanges(saved.base, read, server.send, "ACT");
    expect(server.tasks.get(1)!.description).toBe(WORDS);
    expect(server.tasks.get(1)!.deleted_at ?? null).toBeNull();
  });

  test("a task made here has nothing to wait for", async () => {
    const { base } = await visit();
    const made = run(base, { type: "add", status: "todo", title: "New" });
    expect(unreadBack(diffBoards(base, made), made)).toEqual([]);
  });
});

describe("the public roadmap's read", () => {
  test("fills in the descriptions of public tasks held without one, and holds every public task", async () => {
    const { server, base } = await visit();
    const rows = [...server.tasks.values()].map((t) => taskFrom("ACT", { ...structuredClone(t), comments: [], activity: [], task_votes: [] } as never, () => "Them"));
    const after = apply(base, { kind: "public", tasks: rows });
    expect(after.publicHeld).toBe(true);
    expect(after.tasks["ACT-1"].description).toBe(WORDS);
    expect(after.tasks["ACT-1"].brief).toBeUndefined();
    expect(emptyDiff(diffBoards(base, after))).toBe(true);
  });
});
