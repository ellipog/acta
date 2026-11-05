import { beforeEach, describe, expect, test } from "bun:test";
import { saveChanges } from "@/lib/board-save";
import { boardReducer, newId, pageFrom, seedBoard, type BoardAction, type BoardState } from "@/lib/board-store";
import {
  absorb,
  apply,
  diffBoards,
  emptyDiff,
  keepOwn,
  resolve,
  unsure,
  type Change,
  type Context,
  type Diff,
  type RemoteEvent,
} from "@/lib/board-sync";
import { demoReducer, initDemo, type Demo, type DemoAction } from "@/components/board-app/demo-state";
import { FakeBoardServer } from "./fake-server";

// A board arrives with each task's comment count and latest activity line, and a task's dialog reads the rest of its
// thread. A save compares the board before and after, so a thread that hasn't been read, or an older copy of the
// board from before it was, must never look like comments and activity to delete. These check that it can't, and
// that what comes in live or while catching up keeps the counts right

const THEM = "33333333-3333-4333-8333-333333333333";
const ctx: Context = { prefix: "ACT", nameOf: () => "Them", page: (p) => pageFrom("Web", "web", p) };
const run = (s: BoardState, ...a: BoardAction[]) => a.reduce(boardReducer, s);

let server: FakeBoardServer;
// Stamped by the database's clock, like everything it writes
const at = () => server.now();

// Someone else's comment or activity line, written straight to the database
function theirComment(number: number, body: string) {
  const row = { id: newId(), number, author: THEM, body, created_at: at() };
  server.comments.push(row);
  return row;
}
function theirLine(number: number, text: string) {
  const row = { id: newId(), number, actor: THEM, text, created_at: at() };
  server.activity.push(row);
  return row;
}

// ACT-1 with a long history: comments from someone else and from you in an earlier visit, and plenty of activity.
// Returned as a fresh visit reads it
async function visit() {
  server = new FakeBoardServer();
  const empty = server.load();
  const made = run(
    empty,
    { type: "add", status: "todo", title: "Write the brief" },
    { type: "add", status: "todo", title: "Sketch" },
    { type: "comment", id: "ACT-1", body: "Mine, from last week" },
  );
  await saveChanges(empty, made, server.send, "ACT");
  theirComment(1, "Looks good");
  theirComment(1, "One more thing");
  theirLine(1, "set priority to High");
  return server.load();
}

const ownDeletes = (d: Diff) => [...d.uncomments.map((c) => c.id), ...d.unactivity.map((a) => a.id)];

describe("a board as it arrives", () => {
  beforeEach(async () => void (await visit()));

  test("has each task's comment count and latest activity line, and no threads", () => {
    const t = server.load().tasks["ACT-1"];
    expect(t.partial).toBe(true);
    expect(t.comments).toBe(3);
    expect(t.thread).toEqual([]);
    expect(t.activity.at(-1)?.text).toBe("set priority to High");
  });

  test("has the board's latest lines by other people, for its Inbox", () => {
    theirLine(2, "moved it to In progress");
    theirLine(1, "renamed the task");
    const s = server.load();
    expect(s.tasks["ACT-1"].activity.map((a) => a.text)).toEqual(["set priority to High", "renamed the task"]);
    expect(s.tasks["ACT-2"].activity.map((a) => a.text)).toEqual(["moved it to In progress"]);
  });

  test("reading a task's thread fills it in", () => {
    const base = server.load();
    const read = apply(base, server.thread("ACT-1", base)).tasks["ACT-1"];
    expect(read.partial).toBeUndefined();
    expect(read.thread?.map((c) => c.body)).toEqual(["Mine, from last week", "Looks good", "One more thing"]);
    expect(read.comments).toBe(3);
    expect(read.activity.map((a) => a.text)).toEqual(["created the task", "commented", "set priority to High"]);
  });
});

describe("an unread thread can't be saved as deleted", () => {
  test("next to a copy where it was read", async () => {
    const base = await visit();
    const read = apply(base, server.thread("ACT-1", base));
    // Either way round: an older copy from before the read, or a newer one with nothing read
    expect(emptyDiff(diffBoards(read, base))).toBe(true);
    expect(emptyDiff(diffBoards(base, read))).toBe(true);
  });

  test("not even your own comments from an earlier visit", async () => {
    const base = await visit();
    const read = apply(base, server.thread("ACT-1", base));
    const emptied = { ...read, tasks: { ...read.tasks, "ACT-1": { ...read.tasks["ACT-1"], thread: [], activity: [] } } };
    expect(ownDeletes(diffBoards(read, emptied))).toEqual([]);
  });

  test("through undo and redo, across the read", async () => {
    const base = await visit();
    let saved = base;
    let demo: Demo = initDemo(base);
    const dispatch = (a: DemoAction) => (demo = demoReducer(demo, a));
    const save = async () => {
      const r = await saveChanges(saved, demo.board, server.send, "ACT");
      expect(r.refused).toEqual([]);
      saved = r.base;
      return r;
    };

    dispatch({ type: "update", id: "ACT-1", patch: { priority: "urgent" }, note: "set priority to Urgent" });
    dispatch({ type: "comment", id: "ACT-1", body: "Before the read" });
    await save();
    // The dialog's read lands in base, on screen and in every step of undo, as useBoardSync does it
    const change = server.thread("ACT-1", saved);
    saved = apply(saved, change);
    dispatch({ type: "rebase", current: (b) => apply(b, change), history: (b) => apply(b, change) });
    dispatch({ type: "comment", id: "ACT-1", body: "After the read" });
    await save();

    const theirs = server.comments.filter((c) => c.author === THEM).map((c) => c.id);
    for (let i = 0; i < 3; i++) {
      dispatch({ type: "undo" });
      const d = diffBoards(saved, demo.board);
      // Only what this tab wrote is ever taken back
      for (const id of ownDeletes(d)) expect(theirs).not.toContain(id);
      await save();
    }
    expect(server.comments.map((c) => c.body)).toEqual(["Mine, from last week", "Looks good", "One more thing"]);
    for (let i = 0; i < 3; i++) {
      dispatch({ type: "redo" });
      await save();
    }
    expect(server.comments.map((c) => c.body).sort()).toEqual(
      ["After the read", "Before the read", "Looks good", "Mine, from last week", "One more thing"].sort(),
    );
    // And what's on screen matches the database, count and all
    expect(demo.board.tasks["ACT-1"].comments).toBe(5);
    expect(server.loadWhole().tasks["ACT-1"].thread?.map((c) => c.body)).toEqual(
      demo.board.tasks["ACT-1"].thread?.map((c) => c.body),
    );
  });

  test("an undo step from before the read still can't delete what the read brought", async () => {
    const base = await visit();
    const ui = run(base, { type: "update", id: "ACT-1", patch: { title: "Renamed" }, note: "renamed the task" });
    const r = await saveChanges(base, ui, server.send, "ACT");
    // The step left without the read, as if a rebase had missed it
    const read = apply(r.base, server.thread("ACT-1", r.base));
    const d = diffBoards(read, base);
    expect(ownDeletes(d)).toEqual(r.base.tasks["ACT-1"].activity.filter((a) => a.local).map((a) => a.id!));
  });
});

describe("a comment written before the thread is read", () => {
  test("is kept when the read comes back without it", async () => {
    const base = await visit();
    const ui = run(base, { type: "comment", id: "ACT-1", body: "Quick one" });
    expect(ui.tasks["ACT-1"].comments).toBe(4);
    // Read before the comment saved
    const change = server.thread("ACT-1", base);
    const shown = apply(ui, change);
    const confirmed = apply(base, change);
    expect(shown.tasks["ACT-1"].thread?.map((c) => c.body)).toEqual([
      "Mine, from last week",
      "Looks good",
      "One more thing",
      "Quick one",
    ]);
    expect(shown.tasks["ACT-1"].comments).toBe(4);
    const d = diffBoards(confirmed, shown);
    expect(d.comments.map((c) => c.comment.body)).toEqual(["Quick one"]);
    expect(ownDeletes(d)).toEqual([]);
    const r = await saveChanges(confirmed, shown, server.send, "ACT");
    expect(r.refused).toEqual([]);
    expect(server.comments.filter((c) => c.body === "Quick one")).toHaveLength(1);
  });

  test("shows once when the read comes back with it", async () => {
    const base = await visit();
    const ui = run(base, { type: "comment", id: "ACT-1", body: "Quick one" });
    const r = await saveChanges(base, ui, server.send, "ACT");
    const change = server.thread("ACT-1", r.base);
    const shown = apply(ui, change).tasks["ACT-1"];
    expect(shown.thread?.filter((c) => c.body === "Quick one")).toHaveLength(1);
    expect(shown.comments).toBe(4);
    expect(emptyDiff(diffBoards(apply(r.base, change), apply(ui, change)))).toBe(true);
  });
});

describe("changes that come in for an unread thread", () => {
  const comment = (number: number, body: string): RemoteEvent & { table: "comments" } => ({
    table: "comments",
    row: { id: newId(), board_id: "b", number, author: THEM, body, created_at: at() },
  });

  test("a new comment moves the count, and shows once the thread is read", async () => {
    const base = await visit();
    const ev = { ...comment(1, "Just now"), fresh: true };
    server.comments.push({ id: ev.row!.id, number: 1, author: THEM, body: "Just now", created_at: ev.row!.created_at });
    const after = apply(base, resolve(base, ev, ctx));
    expect(after.tasks["ACT-1"].comments).toBe(4);
    const read = apply(after, server.thread("ACT-1", after)).tasks["ACT-1"];
    expect(read.thread?.filter((c) => c.body === "Just now")).toHaveLength(1);
    expect(read.comments).toBe(4);
  });

  test("an edit to a comment it doesn't hold leaves the count alone", async () => {
    const base = await visit();
    const [existing] = server.comments.filter((c) => c.author === THEM);
    const ev: RemoteEvent = { table: "comments", row: { ...existing, board_id: "b", body: "Edited" } };
    const change = resolve(base, ev, ctx);
    const after = apply(base, change);
    expect(after.tasks["ACT-1"].comments).toBe(3);
    // It may or may not have been counted, so the count is read again
    expect(unsure(base, after, change)).toEqual([1]);
  });

  test("a deletion no thread held has its count read again, keeping what this copy added", async () => {
    const base = await visit();
    const [gone] = server.comments.filter((c) => c.author === THEM);
    server.comments = server.comments.filter((c) => c !== gone);
    const change = resolve(base, { table: "comments", old: { id: gone.id } }, ctx);
    const after = apply(base, change);
    expect(after).toBe(base);
    expect(unsure(base, after, change)).toBe("all");

    // Meanwhile a comment was written here and hasn't saved
    const ui = run(base, { type: "comment", id: "ACT-1", body: "Unsaved" });
    const counts: Change = {
      kind: "counts",
      counts: { "ACT-1": server.comments.filter((c) => c.number === 1).length, "ACT-2": 0 },
      latest: {},
      had: { "ACT-1": [], "ACT-2": [] },
    };
    expect(apply(base, counts).tasks["ACT-1"].comments).toBe(2);
    expect(apply(ui, counts).tasks["ACT-1"].comments).toBe(3);
  });

  test("a deletion found while catching up, of a comment it held, moves the count with it", async () => {
    const base = await visit();
    const ev = { ...comment(1, "Gone soon"), fresh: true };
    const held = apply(base, resolve(base, ev, ctx));
    expect(held.tasks["ACT-1"].comments).toBe(4);
    const change = resolve(held, { table: "comments", old: { id: ev.row!.id, number: 1 } }, ctx);
    const after = apply(held, change);
    expect(after.tasks["ACT-1"].comments).toBe(3);
    expect(unsure(held, after, change)).toBeNull();
  });

  test("a comment read while catching up may already be counted, so the count is read again", async () => {
    const base = await visit();
    const ev = comment(1, "From a minute ago");
    const change = resolve(base, ev, ctx);
    const after = apply(base, change);
    expect(after.tasks["ACT-1"].comments).toBe(3);
    expect(after.tasks["ACT-1"].thread?.map((c) => c.body)).toEqual(["From a minute ago"]);
    expect(unsure(base, after, change)).toEqual([1]);
  });

  test("losing its latest line reads the one before it", async () => {
    const base = await visit();
    const latest = base.tasks["ACT-1"].activity.at(-1)!;
    const change = resolve(base, { table: "activity", old: { id: latest.id! } }, ctx);
    const after = apply(base, change);
    expect(after.tasks["ACT-1"].activity).toEqual([]);
    expect(unsure(base, after, change)).toEqual([1]);
  });

  test("a deletion the server made before the read leaves every copy", async () => {
    const base = await visit();
    const ev = { ...comment(1, "Short lived"), fresh: true };
    server.comments.push({ id: ev.row!.id, number: 1, author: THEM, body: "Short lived", created_at: ev.row!.created_at });
    const held = apply(base, resolve(base, ev, ctx));
    // Deleted, and the live feed missed it
    server.comments = server.comments.filter((c) => c.id !== ev.row!.id);
    const read = apply(held, server.thread("ACT-1", held)).tasks["ACT-1"];
    expect(read.thread?.map((c) => c.body)).not.toContain("Short lived");
    expect(read.comments).toBe(3);
  });
});

describe("reading the board again after a dropped connection", () => {
  test("keeps the comments this tab wrote, so an undo waiting to save still takes one back", async () => {
    const base = await visit();
    const ui = run(base, { type: "comment", id: "ACT-1", body: "Oops" });
    const r = await saveChanges(base, ui, server.send, "ACT");
    // The undo hasn't saved when the connection drops
    const undone = base;
    const fresh = keepOwn(server.load(), r.base);
    const shown = absorb(fresh, undone, diffBoards(r.base, undone));
    const d = diffBoards(fresh, shown);
    expect(d.uncomments).toHaveLength(1);
    await saveChanges(fresh, shown, server.send, "ACT");
    expect(server.comments.map((c) => c.body)).not.toContain("Oops");
    expect(shown.tasks["ACT-1"].comments).toBe(3);
  });
});

describe("the demo board", () => {
  test("has every thread already, so nothing waits to be read", () => {
    const s = seedBoard();
    expect(Object.values(s.tasks).some((t) => t.partial)).toBe(false);
    const after = run(s, { type: "comment", id: "ACT-42", body: "Still works" });
    expect(after.tasks["ACT-42"].comments).toBe(5);
    expect(after.tasks["ACT-42"].thread?.at(-1)?.body).toBe("Still works");
  });
});
