import { describe, expect, test } from "bun:test";
import { saveChanges } from "@/lib/board-save";
import { boardReducer, me, newId, pageFrom, type BoardAction, type BoardState } from "@/lib/board-store";
import { apply, diffBoards, emptyDiff, resolve, type Change, type Context, type RemoteEvent } from "@/lib/board-sync";
import { demoReducer, initDemo, type Demo, type DemoAction } from "@/components/board-app/demo-state";
import { FakeBoardServer } from "./fake-server";

// A comment already written is changed or taken back straight in the database, and what comes back is applied as a
// change from someone else is (see changeComment in useBoardSync). These check that it lands right, says it was
// edited, keeps the counts and leaves nothing for a save to send or take back

const THEM = "33333333-3333-4333-8333-333333333333";
const ctx: Context = { prefix: "ACT", nameOf: () => "Someone", page: (p) => pageFrom("Web", "web", p) };
const run = (s: BoardState, ...a: BoardAction[]) => a.reduce(boardReducer, s);

// ACT-1 with one comment of yours and one of someone else's, saved, with its thread read
async function board() {
  const server = new FakeBoardServer();
  const empty = server.load();
  const made = run(
    empty,
    { type: "add", status: "todo", title: "Write the brief" },
    { type: "comment", id: "ACT-1", body: "Mine" },
  );
  await saveChanges(empty, made, server.send, "ACT");
  server.comments.push({ id: newId(), number: 1, author: THEM, body: "Theirs", created_at: server.now() });
  const fresh = server.load();
  return { server, fresh, read: apply(fresh, server.thread("ACT-1", fresh)) };
}

const row = (server: FakeBoardServer, body: string) => server.comments.find((c) => c.body === body)!;
const edited = (server: FakeBoardServer, body: string, to: string): RemoteEvent => ({
  table: "comments",
  row: { ...row(server, body), board_id: server.board.id, body: to, edited_at: server.now() } as never,
});

describe("a comment's author", () => {
  test("is known by id, so only yours offer to be edited", async () => {
    const { server, read } = await board();
    const thread = read.tasks["ACT-1"].thread!;
    expect(thread.find((c) => c.body === "Mine")?.by).toBe(server.me);
    expect(thread.find((c) => c.body === "Theirs")?.by).toBe(THEM);
  });

  test("is you for one written here", () => {
    const s = run(new FakeBoardServer().load(), { type: "add", status: "todo", title: "T" });
    const next = run(s, { type: "comment", id: "ACT-1", body: "Hello" });
    expect(next.tasks["ACT-1"].thread?.[0].by).toBe(me.id);
  });
});

describe("an edit", () => {
  test("changes what it says and marks when, with the count as it was", async () => {
    const { server, read } = await board();
    const ev = edited(server, "Mine", "Mine, fixed");
    const change = resolve(read, ev, ctx);
    const after = apply(read, change);
    const c = after.tasks["ACT-1"].thread!.find((x) => x.id === row(server, "Mine").id)!;
    expect(c.body).toBe("Mine, fixed");
    expect(c.edited).toBe(Date.parse((ev as { row: { edited_at: string } }).row.edited_at));
    expect(after.tasks["ACT-1"].comments).toBe(2);
    // The same edit again, as the live feed echoes it, changes nothing
    expect(apply(after, change)).toBe(after);
  });

  test("of a thread not read yet leaves the count alone", async () => {
    const { server, fresh } = await board();
    const after = apply(fresh, resolve(fresh, edited(server, "Theirs", "Theirs, fixed"), ctx));
    expect(after.tasks["ACT-1"].comments).toBe(2);
  });

  test("applied to what's saved and what's on screen leaves nothing to save", async () => {
    const { server, read } = await board();
    const change = resolve(read, edited(server, "Mine", "Mine, fixed"), ctx);
    expect(emptyDiff(diffBoards(apply(read, change), apply(read, change)))).toBe(true);
  });

  test("stays through undo and redo of what came before it", async () => {
    const { server, read } = await board();
    let demo: Demo = initDemo(read);
    const dispatch = (a: DemoAction) => (demo = demoReducer(demo, a));
    dispatch({ type: "update", id: "ACT-1", patch: { priority: "urgent" }, note: "set priority to Urgent" });
    const change: Change = resolve(read, edited(server, "Mine", "Mine, fixed"), ctx);
    dispatch({ type: "rebase", current: (b) => apply(b, change), history: (b) => apply(b, change) });
    dispatch({ type: "undo" });
    expect(demo.board.tasks["ACT-1"].priority).not.toBe("urgent");
    expect(demo.board.tasks["ACT-1"].thread!.map((c) => c.body)).toContain("Mine, fixed");
    dispatch({ type: "redo" });
    expect(demo.board.tasks["ACT-1"].thread!.map((c) => c.body)).toContain("Mine, fixed");
  });
});

describe("taking a comment back", () => {
  test("someone else's, as an admin can, comes off the thread and the count with nothing to save", async () => {
    const { server, read } = await board();
    const id = row(server, "Theirs").id;
    const change = resolve(read, { table: "comments", old: { id, number: 1 } }, ctx);
    const saved = apply(read, change);
    const shown = apply(read, change);
    expect(saved.tasks["ACT-1"].thread!.map((c) => c.body)).toEqual(["Mine"]);
    expect(saved.tasks["ACT-1"].comments).toBe(1);
    expect(emptyDiff(diffBoards(saved, shown))).toBe(true);
  });
});
