import { expect, test } from "bun:test";
import { saveChanges } from "@/lib/board-save";
import { boardReducer, pageFrom, type BoardAction, type BoardState } from "@/lib/board-store";
import { apply, resolve, SentLog, type BoardRow, type Context, type TaskRow } from "@/lib/board-sync";
import { FakeBoardServer } from "./fake-server";

// Every save comes back over the live feed. When two saves go out close together, as when a roadmap bar is
// dragged twice or the public page's title is typed, the echo of the first can arrive after the second has
// saved. These check that it can't put the older value back

const ctx: Context = { prefix: "ACT", nameOf: () => "Someone", page: (p) => pageFrom("Web", "web", p) };
const run = (s: BoardState, ...a: BoardAction[]) => a.reduce(boardReducer, s);

async function twoSaves(first: BoardAction, second: BoardAction) {
  const server = new FakeBoardServer();
  const empty = server.load();
  const start = run(empty, { type: "add", status: "todo", title: "Plan" });
  const seeded = (await saveChanges(empty, start, server.send, "ACT")).base;
  const sent = new SentLog();

  const one = run(seeded, first);
  const r1 = await saveChanges(seeded, one, server.send, "ACT");
  for (const p of r1.saved) sent.record(p, r1.goal);
  const echo = {
    task: structuredClone(server.tasks.get(1)!) as TaskRow,
    board: { ...structuredClone(server.board), id: server.board.id } as unknown as BoardRow,
  };

  const two = run(one, second);
  const r2 = await saveChanges(r1.base, two, server.send, "ACT");
  for (const p of r2.saved) sent.record(p, r2.goal);
  return { sent, echo, base: r2.base, ui: two };
}

test("an older roadmap date can't come back after a newer one saved", async () => {
  const { sent, echo, base, ui } = await twoSaves(
    { type: "update", id: "ACT-1", patch: { start: "2026-11-02", due: "2026-11-06" } },
    { type: "update", id: "ACT-1", patch: { start: "2026-11-09", due: "2026-11-13" } },
  );
  const raw = resolve(base, { table: "tasks", row: echo.task }, ctx);
  // Left alone, the echo would move the bar back
  expect(apply(ui, raw, base).tasks["ACT-1"].start).toBe("2026-11-02");
  const after = apply(ui, sent.screen(raw), base).tasks["ACT-1"];
  expect([after.start, after.due]).toEqual(["2026-11-09", "2026-11-13"]);
});

test("an older public page title can't come back while typing", async () => {
  const { sent, echo, base, ui } = await twoSaves(
    { type: "page", patch: { title: "Road" } },
    { type: "page", patch: { title: "Roadmap" } },
  );
  const raw = resolve(base, { table: "boards", row: echo.board }, ctx);
  expect(raw.kind === "board" && raw.page?.title).toBe("Road");
  const screened = sent.screen(raw);
  expect(apply(ui, screened, base).roadmap.page.title).toBe("Roadmap");
});

test("someone else's change still comes through", async () => {
  const { sent, echo, base, ui } = await twoSaves(
    { type: "update", id: "ACT-1", patch: { title: "Mine" } },
    { type: "update", id: "ACT-1", patch: { title: "Mine again" } },
  );
  const theirs = resolve(base, { table: "tasks", row: { ...echo.task, title: "Theirs", priority: "high" } }, ctx);
  const screened = sent.screen(theirs);
  const after = apply(ui, screened, base).tasks["ACT-1"];
  expect(after.title).toBe("Theirs");
  expect(after.priority).toBe("high");
});

test("only the stale field is left out of a mixed echo", async () => {
  const { sent, echo, base, ui } = await twoSaves(
    { type: "update", id: "ACT-1", patch: { title: "First" } },
    { type: "update", id: "ACT-1", patch: { title: "Second" } },
  );
  const mixed = resolve(base, { table: "tasks", row: { ...echo.task, priority: "urgent" } }, ctx);
  const after = apply(ui, sent.screen(mixed), base).tasks["ACT-1"];
  expect(after.title).toBe("Second");
  expect(after.priority).toBe("urgent");
});

test("going back to an earlier value isn't mistaken for an echo", async () => {
  const server = new FakeBoardServer();
  const sent = new SentLog();
  const s = server.load();
  const a = run(s, { type: "add", status: "todo", title: "A" });
  sent.record({ ...emptyParts(), created: ["ACT-1"] }, a, 0);
  const b = run(a, { type: "update", id: "ACT-1", patch: { title: "B" } });
  sent.record({ ...emptyParts(), updated: [{ id: "ACT-1", fields: ["title"] }] }, b, 1);
  const c = run(b, { type: "update", id: "ACT-1", patch: { title: "A" } });
  sent.record({ ...emptyParts(), updated: [{ id: "ACT-1", fields: ["title"] }] }, c, 2);
  expect(sent.stale("ACT-1:title", "A", 3)).toBe(false);
  expect(sent.stale("ACT-1:title", "B", 3)).toBe(true);
  // And after a while nothing counts as an echo any more
  expect(sent.stale("ACT-1:title", "B", 60_000)).toBe(false);
});

function emptyParts() {
  return {
    created: [],
    updated: [],
    deleted: [],
    columns: [],
    comments: [],
    uncomments: [],
    activity: [],
    unactivity: [],
    voted: [],
    unvoted: [],
    roadmapPublic: false,
    page: false,
    suggested: [],
    declined: [],
    suggestionVoted: [],
    suggestionUnvoted: [],
  };
}
