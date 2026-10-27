import { beforeEach, describe, expect, test } from "bun:test";
import { revert, saveChanges } from "@/lib/board-save";
import {
  archiveTasks,
  boardReducer,
  fitTask,
  limits,
  type BoardAction,
  type BoardState,
  type Task,
} from "@/lib/board-store";
import { diffBoards, emptyDiff, syncedFields } from "@/lib/board-sync";
import { FakeBoardServer } from "./fake-server";

// Every kind of edit the app makes is saved, read back from the database, and compared with what the app shows.
// If one of these fails, an edit is being lost somewhere between the screen and the database

const ASSIGNEE = "33333333-3333-4333-8333-333333333333";

// What a person can see of a board, without the parts that only differ in how they're stored
function view(s: BoardState) {
  return {
    columns: Object.fromEntries(Object.entries(s.columns).filter(([, ids]) => ids.length)),
    tasks: Object.fromEntries(
      Object.values(s.tasks).map((t) => [
        t.id,
        {
          title: t.title,
          status: t.status,
          priority: t.priority,
          size: t.size ?? null,
          project: t.project ?? null,
          labels: t.labels,
          start: t.start ?? null,
          due: t.due ?? null,
          assignee: t.assignee ?? null,
          description: t.description,
          subtasks: t.subtasks,
          public: Boolean(t.public),
          shipped: t.shipped ?? null,
          archived: Boolean(t.archived),
          votes: t.votes ?? 0,
          voted: Boolean(t.voted),
          thread: (t.thread ?? []).map((c) => c.body),
          activity: t.activity.map((a) => a.text),
        },
      ]),
    ),
    public: s.roadmap.public,
    page: s.roadmap.page,
    ideas: s.roadmap.suggestions
      .map((x) => ({ id: x.id, title: x.title, details: x.details ?? null, votes: x.votes, voted: Boolean(x.voted) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

const run = (s: BoardState, ...actions: BoardAction[]) => actions.reduce(boardReducer, s);

let server: FakeBoardServer;

// A board with a few tasks on it, made through the app and saved
async function seeded() {
  server = new FakeBoardServer();
  const empty = server.load();
  const ui = run(
    empty,
    { type: "add", status: "todo", title: "Write the brief" },
    { type: "add", status: "todo", title: "Sketch the layout" },
    { type: "add", status: "in_progress", title: "Set up the repo" },
    { type: "add", status: "done", title: "Pick a name" },
    { type: "suggest", title: "Dark mode", details: "Easier at night" },
  );
  const r = await saveChanges(empty, ui, server.send, "ACT");
  expect(r.refused).toEqual([]);
  server.requests = [];
  return server.load();
}

async function saves(base: BoardState, ui: BoardState) {
  const r = await saveChanges(base, ui, server.send, "ACT");
  expect(r.refused).toEqual([]);
  expect(r.waiting).toBe(false);
  // What the database holds and what the app thinks it holds both match the screen
  expect(view(server.load())).toEqual(view(ui));
  expect(view(r.base)).toEqual(view(ui));
  // And nothing is left to send
  expect(emptyDiff(diffBoards(r.base, ui))).toBe(true);
  return r;
}

describe("every edit reaches the database", () => {
  beforeEach(() => {
    server = new FakeBoardServer();
  });

  test("new tasks", async () => {
    const base = server.load();
    await saves(
      base,
      run(
        base,
        { type: "add", status: "todo", title: "One" },
        { type: "add", status: "review", title: "Two", patch: { priority: "high", labels: ["Bug"], due: "2026-11-02" } },
      ),
    );
  });

  const edits: [string, (s: BoardState) => BoardAction | BoardAction[]][] = [
    ["rename", () => ({ type: "update", id: "ACT-1", patch: { title: "Write the short brief" }, note: "renamed the task" })],
    ["finish (sets the shipped date)", () => ({ type: "update", id: "ACT-1", patch: { status: "done" }, note: "moved it to Done" })],
    ["reopen (clears the shipped date)", () => ({ type: "update", id: "ACT-4", patch: { status: "todo" } })],
    ["cancel", () => ({ type: "update", id: "ACT-2", patch: { status: "canceled" } })],
    ["priority", () => ({ type: "update", id: "ACT-1", patch: { priority: "urgent" } })],
    ["size", () => ({ type: "update", id: "ACT-1", patch: { size: "xl" } })],
    ["clear the size", () => [
      { type: "update", id: "ACT-1", patch: { size: "s" } },
      { type: "update", id: "ACT-1", patch: { size: undefined } },
    ]],
    ["project", () => ({ type: "update", id: "ACT-1", patch: { project: "Launch" } })],
    ["labels", () => ({ type: "update", id: "ACT-1", patch: { labels: ["Bug", "Design"] } })],
    ["start date (roadmap)", () => ({ type: "update", id: "ACT-1", patch: { start: "2026-11-03" } })],
    ["due date (roadmap)", () => ({ type: "update", id: "ACT-1", patch: { due: "2026-11-20" } })],
    ["drag a bar on the roadmap", () => [
      { type: "update", id: "ACT-1", patch: { start: "2026-11-03", due: "2026-11-07" } },
      { type: "update", id: "ACT-1", patch: { start: "2026-11-10", due: "2026-11-14" }, note: "scheduled it" },
    ]],
    ["assignee", () => ({ type: "update", id: "ACT-1", patch: { assignee: ASSIGNEE } })],
    ["description", () => ({ type: "update", id: "ACT-1", patch: { description: "# Brief\n\n- one\n- two" } })],
    ["add a subtask", () => ({ type: "addSubtask", id: "ACT-1", title: "Research" })],
    ["tick a subtask", (s) => {
      const added = boardReducer(s, { type: "addSubtask", id: "ACT-1", title: "Research" });
      return [{ type: "addSubtask", id: "ACT-1", title: "Research" }, { type: "toggleSubtask", id: "ACT-1", subId: added.tasks["ACT-1"].subtasks[0].id }];
    }],
    ["put on the public roadmap", () => ({ type: "update", id: "ACT-1", patch: { public: true } })],
    ["archive", () => archiveTasks(["ACT-4"], true)],
    ["unarchive", () => [archiveTasks(["ACT-4"], true), archiveTasks(["ACT-4"], false)]],
    ["bulk edit", () => ({ type: "bulk", ids: ["ACT-1", "ACT-2"], patch: { priority: "low" }, note: "set priority" })],
    ["delete", () => ({ type: "delete", ids: ["ACT-2"] })],
    ["comment", () => ({ type: "comment", id: "ACT-1", body: "Looks **good**" })],
    ["vote", () => ({ type: "vote", id: "ACT-1" })],
    ["drag within a column", () => ({ type: "move", id: "ACT-2", to: "todo", before: "ACT-1" })],
    ["drag to another column", () => ({ type: "move", id: "ACT-1", to: "in_progress", before: "ACT-3", note: "moved it to In progress" })],
    ["drag to an empty column", () => ({ type: "move", id: "ACT-1", to: "review", before: null, note: "moved it to In review" })],
    ["drag between table groups", () => ({ type: "move", id: "ACT-2", to: "todo", before: null, patch: { assignee: ASSIGNEE }, note: "assigned someone" })],
    ["reorder a column", (s) => ({ type: "columns", columns: { ...s.columns, todo: [...s.columns.todo].reverse() } })],
    ["make the roadmap public", () => ({ type: "roadmap", public: true })],
    ["public page settings", () => ({ type: "page", patch: { title: "What’s next", layout: "timeline", accent: "malachite", showTeam: true } })],
    ["new idea", () => ({ type: "suggest", title: "Calendar view" })],
    ["vote on an idea", (s) => ({ type: "voteSuggestion", id: s.roadmap.suggestions[0].id })],
    ["accept an idea", (s) => ({ type: "acceptSuggestion", id: s.roadmap.suggestions[0].id })],
    ["decline an idea", (s) => ({ type: "declineSuggestion", id: s.roadmap.suggestions[0].id })],
  ];

  for (const [name, make] of edits)
    test(name, async () => {
      const base = await seeded();
      const made = make(base);
      await saves(base, run(base, ...(Array.isArray(made) ? made : [made])));
    });

  test("undo of a delete", async () => {
    const base = await seeded();
    const task = base.tasks["ACT-2"];
    const gone = run(base, { type: "delete", ids: ["ACT-2"] });
    const r = await saves(base, gone);
    await saves(r.base, run(gone, { type: "undelete", items: [{ task, index: 1 }] }));
  });

  test("many edits at once", async () => {
    const base = await seeded();
    await saves(
      base,
      run(
        base,
        { type: "update", id: "ACT-1", patch: { title: "Brief", priority: "high" } },
        { type: "move", id: "ACT-3", to: "review", before: null },
        { type: "comment", id: "ACT-3", body: "Ready" },
        { type: "add", status: "todo", title: "Another" },
        { type: "comment", id: "ACT-5", body: "On the new one" },
        { type: "page", patch: { tagline: "Hello" } },
        { type: "delete", ids: ["ACT-4"] },
      ),
    );
  });

  test("every task field is saved, or kept some other way on purpose", async () => {
    // Required<Task> makes this list grow with the type, so a new field can't be missed here
    const full = {
      id: "ACT-1",
      title: "All of it",
      status: "review",
      priority: "high",
      size: "m",
      project: "Launch",
      labels: ["Bug"],
      start: "2026-11-01",
      due: "2026-11-09",
      assignee: ASSIGNEE,
      description: "Words",
      subtasks: [{ id: "s1", title: "Step", done: true }],
      comments: 0,
      thread: [],
      activity: [],
      public: true,
      votes: 0,
      voted: false,
      shipped: "2026-11-09",
      archived: "2026-11-10T00:00:00.000Z",
      origin: "44444444-4444-4444-8444-444444444444",
    } satisfies Required<Task>;
    // Comments, activity and votes have tables of their own, and the id and origin are fixed when it's made
    const elsewhere = ["id", "comments", "thread", "activity", "votes", "voted", "origin"];
    expect(Object.keys(full).sort()).toEqual([...syncedFields, ...elsewhere].sort());

    server = new FakeBoardServer();
    const base = server.load();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, comments, thread, activity, votes, voted, ...fields } = full;
    const ui = run(base, { type: "add", status: "review", title: full.title, patch: fields });
    await saves(base, ui);
    const back = server.load().tasks["ACT-1"];
    for (const f of syncedFields) expect([f, back[f]]).toEqual([f, ui.tasks["ACT-1"][f]]);
  });
});

describe("a change the database turns down", () => {
  test("costs only that change, and the rest still saves", async () => {
    const base = await seeded();
    server.refuse = (c) =>
      c.updated.some((u) => (u.fields as { labels?: string[] }).labels?.includes("forbidden"))
        ? { code: "23514", message: "check constraint" }
        : null;
    const ui = run(
      base,
      { type: "update", id: "ACT-1", patch: { title: "Saved anyway" } },
      { type: "update", id: "ACT-2", patch: { labels: ["forbidden"] } },
      { type: "comment", id: "ACT-3", body: "Still here" },
    );
    const r = await saveChanges(base, ui, server.send, "ACT");
    expect(r.refused.map((x) => x.what)).toEqual(["Changes to ACT-2 · Sketch the layout"]);
    const after = server.load();
    expect(after.tasks["ACT-1"].title).toBe("Saved anyway");
    expect(after.tasks["ACT-3"].thread?.map((c) => c.body)).toEqual(["Still here"]);
    expect(after.tasks["ACT-2"].labels).toEqual([]);

    // Taking it back off the screen leaves nothing to send again, so it doesn't fail on every save after
    const shown = revert(ui, r.base, r.refused[0].diff);
    expect(shown.tasks["ACT-2"].labels).toEqual([]);
    expect(shown.tasks["ACT-1"].title).toBe("Saved anyway");
    expect(emptyDiff(diffBoards(r.base, shown))).toBe(true);
  });

  test("a refused new task comes off the board", async () => {
    const base = await seeded();
    server.refuse = (c) =>
      (c.created as { title?: string }[]).some((t) => t.title === "Nope") ? { code: "42501", message: "no" } : null;
    const ui = run(
      base,
      { type: "add", status: "todo", title: "Nope" },
      { type: "update", id: "ACT-1", patch: { priority: "low" } },
    );
    const r = await saveChanges(base, ui, server.send, "ACT");
    expect(r.refused).toHaveLength(1);
    expect(r.refused[0].why).toContain("permission");
    const shown = revert(ui, r.base, r.refused[0].diff);
    expect(shown.tasks["ACT-5"]).toBeUndefined();
    expect(shown.columns.todo).not.toContain("ACT-5");
    expect(server.load().tasks["ACT-1"].priority).toBe("low");
    expect(emptyDiff(diffBoards(r.base, shown))).toBe(true);
  });

  test("a refused move goes back to its column", async () => {
    const base = await seeded();
    server.refuse = (c) =>
      c.updated.some((u) => (u.fields as { status?: string }).status === "review") ? { code: "23514", message: "no" } : null;
    const ui = run(base, { type: "move", id: "ACT-1", to: "review", before: null });
    const r = await saveChanges(base, ui, server.send, "ACT");
    const shown = revert(ui, r.base, r.refused[0].diff);
    expect(shown.tasks["ACT-1"].status).toBe("todo");
    expect(shown.columns.todo).toContain("ACT-1");
    expect(shown.columns.review).not.toContain("ACT-1");
  });
});

describe("trouble that isn't about the change", () => {
  for (const [name, error] of [
    ["a dropped connection", { message: "TypeError: Failed to fetch" }],
    ["an expired sign-in", { code: "PGRST301", message: "JWT expired" }],
    ["a server error", { code: "XX000", message: "internal error" }],
    ["a timeout", { code: "57014", message: "canceling statement due to statement timeout" }],
  ] as const)
    test(`${name} keeps every change for the next try`, async () => {
      const base = await seeded();
      server.refuse = () => error;
      const ui = run(base, { type: "update", id: "ACT-1", patch: { title: "Kept" } }, { type: "comment", id: "ACT-1", body: "Kept too" });
      const r = await saveChanges(base, ui, server.send, "ACT");
      expect(r.waiting).toBe(true);
      expect(r.refused).toEqual([]);
      expect(r.base).toBe(base);
      server.refuse = null;
      await saves(r.base, ui);
    });

  test("a thrown fetch is a dropped connection too", async () => {
    const base = await seeded();
    const ui = run(base, { type: "update", id: "ACT-1", patch: { title: "Kept" } });
    const r = await saveChanges(base, ui, () => Promise.reject(new TypeError("Failed to fetch")), "ACT");
    expect(r.waiting).toBe(true);
    await saves(r.base, ui);
  });
});

describe("new tasks someone else numbered first", () => {
  test("move to the next number, comments and all", async () => {
    const base = await seeded();
    // Someone else adds ACT-5 while this board still thinks 5 is free
    const other = run(base, { type: "add", status: "todo", title: "Theirs" });
    await saveChanges(base, other, server.send, "ACT");

    const mine = run(base, { type: "add", status: "todo", title: "Mine" }, { type: "comment", id: "ACT-5", body: "On mine" });
    const r = await saveChanges(base, mine, server.send, "ACT");
    expect(r.renamed).toEqual([["ACT-5", "ACT-6"]]);
    const after = server.load();
    expect(after.tasks["ACT-5"].title).toBe("Theirs");
    expect(after.tasks["ACT-6"].title).toBe("Mine");
    expect(after.tasks["ACT-6"].thread?.map((c) => c.body)).toEqual(["On mine"]);
  });
});

describe("limits", () => {
  test("a long paste is cut to fit rather than failing to save", async () => {
    const base = await seeded();
    const long = "x".repeat(limits.title + 100);
    const ui = run(base, { type: "update", id: "ACT-1", patch: { title: long, description: "y".repeat(limits.description + 5) } });
    expect(ui.tasks["ACT-1"].title).toHaveLength(limits.title);
    await saves(base, ui);
  });

  test("labels, projects and subtasks stay inside what the database allows", () => {
    const out = fitTask({
      labels: Array.from({ length: 30 }, (_, i) => `L${i}`),
      project: "p".repeat(100),
      subtasks: Array.from({ length: 400 }, (_, i) => ({ id: `s${i}`, title: "step ".repeat(40), done: false })),
    });
    expect(out.labels).toHaveLength(limits.labels);
    expect(out.project).toHaveLength(limits.project);
    expect(new TextEncoder().encode(JSON.stringify(out.subtasks)).length).toBeLessThanOrEqual(limits.subtaskBytes);
  });

  test("an empty comment or idea isn't made at all", async () => {
    const base = await seeded();
    expect(run(base, { type: "comment", id: "ACT-1", body: "   " })).toBe(base);
    expect(run(base, { type: "suggest", title: "  " })).toBe(base);
  });
});
