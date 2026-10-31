import { expect, test } from "bun:test";
import { saveChanges } from "@/lib/board-save";
import { boardReducer, pageFrom, type BoardAction, type BoardState } from "@/lib/board-store";
import { apply, resolve, SentLog, type Context, type TaskRow } from "@/lib/board-sync";
import { duration, timeToClose } from "@/lib/dates";
import { publicState, type PublicRoadmapData } from "@/lib/public-roadmap";
import { FakeBoardServer } from "./fake-server";

// A task knows when it was made and when it last closed, so a board can say how long work took. The database
// keeps both times, and the screen shows its own guess until the database's comes back

const ctx: Context = { prefix: "ACT", nameOf: () => "Someone", page: (p) => pageFrom("Web", "web", p) };
const run = (s: BoardState, ...a: BoardAction[]) => a.reduce(boardReducer, s);
const move = (status: BoardState["tasks"][string]["status"]): BoardAction => ({
  type: "update",
  id: "ACT-1",
  patch: { status },
});

test("closing stamps the time, reopening clears it, and done to canceled keeps it", () => {
  const empty = new FakeBoardServer().load();
  let s = run(empty, { type: "add", status: "todo", title: "Fix the login" });
  expect(s.tasks["ACT-1"].opened).toBeString();
  expect(s.tasks["ACT-1"].closed).toBeUndefined();

  s = run(s, move("done"));
  const closed = s.tasks["ACT-1"].closed;
  expect(closed).toBeString();
  s = run(s, move("canceled"));
  expect(s.tasks["ACT-1"].closed).toBe(closed);
  s = run(s, move("review"));
  expect(s.tasks["ACT-1"].closed).toBeUndefined();

  const made = run(empty, { type: "add", status: "done", title: "Already shipped" }).tasks["ACT-1"];
  expect(made.closed).toBe(made.opened);
});

test("the database's times are what a board loads", async () => {
  const server = new FakeBoardServer();
  const empty = server.load();
  const one = run(empty, { type: "add", status: "todo", title: "Fix the login" });
  const base = (await saveChanges(empty, one, server.send, "ACT")).base;
  const done = run(base, move("done"));
  const saved = (await saveChanges(base, done, server.send, "ACT")).base;

  const row = server.tasks.get(1)!;
  expect(row.closed_at).toBeString();
  const loaded = server.load().tasks["ACT-1"];
  expect(loaded.opened).toBe(new Date(row.created_at).toISOString());
  expect(loaded.closed).toBe(new Date(row.closed_at!).toISOString());

  await saveChanges(saved, run(saved, move("todo")), server.send, "ACT");
  expect(server.tasks.get(1)!.closed_at).toBeNull();
  expect(server.load().tasks["ACT-1"].closed).toBeUndefined();
});

test("the database's closed time replaces the screen's when it comes back", async () => {
  const server = new FakeBoardServer();
  const empty = server.load();
  const one = run(empty, { type: "add", status: "todo", title: "Fix the login" });
  const base = (await saveChanges(empty, one, server.send, "ACT")).base;
  const ui = run(base, move("done"));
  const r = await saveChanges(base, ui, server.send, "ACT");

  const echo = structuredClone(server.tasks.get(1)!) as TaskRow;
  echo.closed_at = "2026-10-27T09:30:00.000Z";
  const after = apply(ui, resolve(r.base, { table: "tasks", row: echo }, ctx), r.base).tasks["ACT-1"];
  expect(after.closed).toBe("2026-10-27T09:30:00.000Z");

  // A row from before the migration has no closed_at at all, which says nothing about it
  const old = structuredClone(server.tasks.get(1)!) as TaskRow;
  delete old.closed_at;
  const kept = apply(ui, resolve(r.base, { table: "tasks", row: old }, ctx), r.base).tasks["ACT-1"];
  expect(kept.closed).toBe(ui.tasks["ACT-1"].closed);
});

test("an older echo can't close a task that was reopened since", async () => {
  const server = new FakeBoardServer();
  const empty = server.load();
  const seeded = (await saveChanges(empty, run(empty, { type: "add", status: "todo", title: "Plan" }), server.send, "ACT"))
    .base;
  const sent = new SentLog();

  const one = run(seeded, move("done"));
  const r1 = await saveChanges(seeded, one, server.send, "ACT");
  for (const p of r1.saved) sent.record(p, r1.goal);
  const echo = structuredClone(server.tasks.get(1)!) as TaskRow;
  expect(echo.closed_at).toBeString();

  const two = run(one, move("todo"));
  const r2 = await saveChanges(r1.base, two, server.send, "ACT");
  for (const p of r2.saved) sent.record(p, r2.goal);

  const after = apply(two, sent.screen(resolve(r2.base, { table: "tasks", row: echo }, ctx)), r2.base).tasks["ACT-1"];
  expect(after.status).toBe("todo");
  expect(after.closed).toBeUndefined();
});

test("how long something took reads in the unit that fits", () => {
  const minute = 60_000;
  const hour = 60 * minute;
  expect(duration(20_000)).toBe("under a minute");
  expect(duration(minute)).toBe("1 minute");
  expect(duration(45 * minute)).toBe("45 minutes");
  expect(duration(6 * hour)).toBe("6 hours");
  expect(duration(30 * hour)).toBe("30 hours");
  expect(duration(3 * 24 * hour)).toBe("3 days");
  expect(duration(90 * 24 * hour)).toBe("3 months");
  expect(duration(800 * 24 * hour)).toBe("2 years");

  expect(timeToClose({ opened: "2026-10-01T09:00:00Z", closed: "2026-10-01T15:00:00Z" })).toBe(6 * hour);
  expect(timeToClose({ opened: "2026-10-01T09:00:00Z" })).toBeNull();
  expect(timeToClose({ closed: "2026-10-01T15:00:00Z" })).toBeNull();
  // A closed time a moment before the open one, from a clock that was off, is no time at all
  expect(timeToClose({ opened: "2026-10-01T09:00:05Z", closed: "2026-10-01T09:00:00Z" })).toBe(0);
});

test("the public page gets the times and labels the database lets it show", () => {
  const data: PublicRoadmapData = {
    workspace: { name: "Acme", slug: "acme", sigil: "crystal-cluster", tone: "lapis" },
    board: { id: "b", name: "Web", slug: "web", prefix: "WEB", projects: [], page: { showTimeTaken: true } },
    tasks: [
      {
        number: 7,
        title: "Fix the login",
        status: "done",
        project: null,
        labels: ["Bug"],
        opened: "2026-10-01T09:00:00Z",
        closed: "2026-10-01T15:00:00Z",
        start_on: null,
        due_on: null,
        shipped_on: "2026-10-01",
        description: "",
        subtasks: [],
        votes: 3,
        voted: false,
        assignee: null,
      },
    ],
    suggestions: [],
  };
  const t = publicState(data).tasks["WEB-7"];
  expect(t.labels).toEqual(["Bug"]);
  expect(timeToClose(t)).toBe(6 * 3_600_000);
  // Before the migration the fields aren't there, and nothing breaks
  const older = { ...data.tasks[0] };
  delete older.labels;
  delete older.opened;
  delete older.closed;
  const before = publicState({ ...data, tasks: [older] }).tasks["WEB-7"];
  expect(before.labels).toEqual([]);
  expect(timeToClose(before)).toBeNull();
});
