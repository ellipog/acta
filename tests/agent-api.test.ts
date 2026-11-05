import { afterAll, beforeAll, beforeEach, expect, mock, setSystemTime, test } from "bun:test";
import { createHash } from "node:crypto";
import { fakeSupabase as db } from "./fake-supabase";
import { agent, seed, state, steady, token } from "./agent-world";

// The agent API against a stand-in database that counts round trips: update_tasks saves a whole list at once yet
// leaves the board as changing the tasks one at a time would, a task that can't change only fails itself, reads
// go out together, and a key is looked up once in a while rather than on every call

const afters: (() => unknown)[] = [];
const real = await import("next/server");
mock.module("next/server", () => ({ ...real, after: (fn: () => unknown) => void afters.push(fn) }));
mock.module("server-only", () => ({}));
mock.module("@/lib/supabase/admin", () => ({ createAdminClient: () => db, serviceReady: true }));
const { actaFor, Problem, taskStatuses } = await import("@/lib/agents/acta");
const { verifyKey } = await import("@/lib/agents/keys");

type Acta = ReturnType<typeof actaFor>;
type Entry = Parameters<Acta["updateTasks"]>[1][number];
const ref = "aaen/acta";
const everything = { status: [...taskStatuses] };

const fresh = () => {
  seed(db);
  afters.length = 0;
  return actaFor(agent);
};
const position = (n: number) => db.rows("tasks").find((t) => t.number === n)!.position;

// What update_tasks answered before it saved lists at once: each task changed on its own, in turn
async function oneAtATime(a: Acta, list: Entry[]) {
  const updated: Record<string, unknown>[] = [];
  const failed: { task: string; problem: string }[] = [];
  for (const { task, ...patch } of list) {
    try {
      updated.push({ id: task, ...(await a.updateTask(ref, task, patch)) });
    } catch (error) {
      if (!(error instanceof Problem)) throw error;
      failed.push({ task, problem: (error as Error).message });
    }
  }
  return { board: ref, ...(updated.length ? { updated } : {}), ...(failed.length ? { failed } : {}) };
}

// Runs a list both ways on the same board and expects the same answer and the same board afterwards
async function sameAsOneAtATime(list: Entry[]) {
  const expected = await oneAtATime(fresh(), list);
  const before = steady(state(db));
  const answer = await fresh().updateTasks(ref, list);
  expect(steady(answer)).toEqual(steady(expected));
  expect(steady(state(db))).toEqual(before);
  return answer;
}

const prior = process.env.GITHUB_APP_ID;
beforeAll(async () => {
  process.env.GITHUB_APP_ID = "1";
  // A running server has long since checked which newer columns the database has
  await fresh().tasks(ref, {});
});
afterAll(() => {
  if (prior === undefined) delete process.env.GITHUB_APP_ID;
  else process.env.GITHUB_APP_ID = prior;
  setSystemTime();
});
beforeEach(() => fresh());

const ten: Entry[] = [
  { task: "ACT-1", status: "done" },
  { task: "ACT-2", status: "done", remove_labels: ["Bug"] },
  { task: "ACT-3", assignee: "Sam" },
  { task: "ACT-4", add_labels: ["Nope"] },
  { task: "ACT-5", status: "todo", assignee: null },
  { task: "ACT-6", priority: "high" },
  { task: "ACT-99", priority: "high" },
  { task: "ACT-8", archived: true },
  { task: "ACT-9", add_subtasks: ["Check it"], title: "Task nine" },
  { task: "ACT-10", status: "in_progress" },
];

test("update_tasks saves a list in one go and reports the tasks that can't change", async () => {
  const answer = await fresh().updateTasks(ref, ten);
  expect(db.applied).toHaveLength(1);
  expect(db.rounds).toBeLessThanOrEqual(4);
  expect(afters).toHaveLength(1);
  expect(answer.failed).toEqual([
    { task: "ACT-4", problem: "aaen/acta has no label “Nope”. Its labels: Bug, Feature." },
    { task: "ACT-99", problem: "There’s no task ACT-99 on aaen/acta." },
  ]);
  expect(answer.updated?.map((u) => u.id)).toEqual(["ACT-1", "ACT-2", "ACT-3", "ACT-5", "ACT-6", "ACT-8", "ACT-9", "ACT-10"]);
  await sameAsOneAtATime(ten);
});

test("tasks moved to the same column line up at its bottom in the order they were given", async () => {
  const list: Entry[] = [
    { task: "ACT-5", status: "done" },
    { task: "ACT-6", status: "done" },
    { task: "ACT-1", status: "in_progress" },
    { task: "ACT-8", status: "in_progress" },
  ];
  await fresh().updateTasks(ref, list);
  // Done ended at 1, and in progress at 2 once two of its three tasks left, as only the one at the bottom stayed
  expect([position(5), position(6)]).toEqual([2, 3]);
  expect([position(1), position(8)]).toEqual([3, 4]);
  await sameAsOneAtATime(list);
});

test("a task named twice changes from where its first change left it", async () => {
  const answer = await sameAsOneAtATime([
    { task: "ACT-1", status: "done" },
    { task: "ACT-1", status: "review", priority: "low" },
    { task: "ACT-2", status: "done" },
    { task: "1", status: "review" },
  ]);
  expect(answer.updated?.[1]).toMatchObject({ changed: ["moved it to In review", "set priority to Low"] });
  expect(answer.updated?.[3]).toMatchObject({ unchanged: true });
});

test("placing a task sees the moves before it in the same call", async () => {
  await sameAsOneAtATime([
    { task: "ACT-1", status: "review" },
    { task: "ACT-2", place: "top" },
    { task: "ACT-3", status: "review" },
    { task: "ACT-4", status: "review", before: "ACT-1" },
    { task: "ACT-5", status: "review" },
    { task: "ACT-6", place: "top", after: "ACT-7" },
  ]);
  // A column nothing else in the call touches is placed without saving first
  await sameAsOneAtATime([
    { task: "ACT-1", status: "done" },
    { task: "ACT-6", place: "top" },
    { task: "ACT-7", status: "done" },
  ]);
  expect(db.applied).toHaveLength(1);
});

test("when the database turns the list down, each task goes on its own and only the bad one fails", async () => {
  const list: Entry[] = [
    { task: "ACT-1", status: "done" },
    { task: "ACT-3", add_labels: ["Feature"] },
    { task: "ACT-2", status: "done" },
    { task: "ACT-4", priority: "urgent" },
  ];
  const refuse = (c: Record<string, unknown>) =>
    (c.updated as { number: number }[]).some((u) => u.number === 3)
      ? { code: "23514", message: "tasks_labels_check" }
      : null;
  const a = fresh();
  db.refuse = refuse;
  const answer = await a.updateTasks(ref, list);
  expect(answer.failed).toEqual([{ task: "ACT-3", problem: "tasks_labels_check" }]);
  expect(answer.updated?.map((u) => u.id)).toEqual(["ACT-1", "ACT-2", "ACT-4"]);
  // The list, then each task on its own
  expect(db.applied).toHaveLength(5);
  // Positions come from the board as each task found it, not from the list that wasn't saved
  expect([position(1), position(2)]).toEqual([2, 3]);
  expect(db.rows("tasks").find((t) => t.number === 3)!.labels).toEqual([]);
  expect(afters).toHaveLength(1);
});

test("a board that isn't there fails every task, as it always did", async () => {
  const answer = await fresh().updateTasks("aaen/nope", [{ task: "ACT-1" }, { task: "ACT-2" }]);
  const problem = "There’s no board “nope” in aaen. Call list_boards to see the boards.";
  expect(answer).toEqual({ board: "aaen/nope", failed: [{ task: "ACT-1", problem }, { task: "ACT-2", problem }] });
});

test("update_task answers with the task as reading it again would show it", async () => {
  const a = fresh();
  const answer = await a.updateTask(ref, "ACT-1", {
    status: "done",
    assignee: "me",
    add_labels: ["bug"],
    complete_subtasks: ["Write it"],
    fields: { Customer: "Acme" },
    priority: "high",
    due: "2026-12-01",
    project: "launch",
  });
  expect(db.rounds).toBeLessThanOrEqual(4);
  const reread = await actaFor(agent).tasks(ref, everything);
  expect(answer.task).toEqual(reread.tasks.find((t) => t.id === "ACT-1")!);

  const archived = await fresh().updateTask(ref, "ACT-3", { archived: true, title: "Tidied" });
  const shelf = await actaFor(agent).tasks(ref, { archived: true });
  expect(archived.task).toEqual(shelf.tasks.find((t) => t.id === "ACT-3")!);
  expect(archived.task?.archived).toMatch(/\+00:00$/);
});

test("update_task keeps its answers for tasks that don't change or can't", async () => {
  const a = fresh();
  expect(await a.updateTask(ref, "ACT-2", { status: "todo", labels: ["Bug"] })).toEqual({
    unchanged: true,
    task: { id: "ACT-2", title: "Task 2", status: "todo", labels: ["Bug"] },
  });
  expect(db.applied).toHaveLength(0);
  await expect(a.updateTask(ref, "ACT-12", { status: "done" })).rejects.toThrow(
    "ACT-12 was deleted. restore_task brings it back.",
  );
  await expect(a.updateTask(ref, "XYZ-1", {})).rejects.toThrow("XYZ-1 isn’t on aaen/acta. Its tasks start with ACT-.");
});

test("reads that don't wait on each other go out together", async () => {
  await fresh().task(ref, "ACT-1");
  expect(db.rounds).toBeLessThanOrEqual(3);
  await fresh().tasks(ref, {});
  expect(db.rounds).toBeLessThanOrEqual(4);
  await fresh().searchAll({ assignee: "me" });
  expect(db.rounds).toBeLessThanOrEqual(3);
});

test("one GitHub flush per board per request", async () => {
  const a = fresh();
  await a.updateTask(ref, "ACT-1", { status: "done" });
  await a.updateTask(ref, "ACT-2", { status: "done" });
  await a.comment(ref, "ACT-3", { body: "Looks good" });
  expect(afters).toHaveLength(1);
  // A new request flushes again
  await actaFor(agent).updateTask(ref, "ACT-4", { status: "done" });
  expect(afters).toHaveLength(2);
});

const tokenOf = (c: string) => `acta_${c.repeat(32)}`;
const addKey = (t: string, usedAt: string | null) =>
  db.rows("agent_keys").push({
    id: `key-${t}`,
    hash: createHash("sha256").update(t).digest("hex"),
    user_id: agent.userId,
    name: "Other",
    access: "read",
    workspaces: null,
    used_at: usedAt,
  });
const keyTrips = () => db.calls.filter((c) => c === "select agent_keys").length;

test("a key that works is looked up once every 30 seconds, and one that doesn't is asked about every time", async () => {
  setSystemTime(new Date("2026-11-05T12:00:00Z"));
  const t = tokenOf("q");
  expect(await verifyKey(t)).toBeNull();
  expect(await verifyKey(t)).toBeNull();
  expect(keyTrips()).toBe(2);
  // Made just now, so it works at once
  addKey(t, new Date().toISOString());
  expect((await verifyKey(t))?.keyId).toBe(`key-${t}`);
  expect((await verifyKey(t))?.keyId).toBe(`key-${t}`);
  expect(keyTrips()).toBe(3);
  // Revoked, it keeps reading until the 30 seconds are up
  db.tables.agent_keys = db.rows("agent_keys").filter((k) => k.id !== `key-${t}`);
  setSystemTime(new Date("2026-11-05T12:00:29Z"));
  expect(await verifyKey(t)).not.toBeNull();
  setSystemTime(new Date("2026-11-05T12:00:31Z"));
  expect(await verifyKey(t)).toBeNull();
  expect(await verifyKey(token)).not.toBeNull();
  setSystemTime();
});

test("a key's last use is saved at most every 10 minutes", async () => {
  setSystemTime(new Date("2026-11-05T13:00:00Z"));
  const t = tokenOf("u");
  addKey(t, "2026-11-05T12:40:00+00:00");
  await verifyKey(t);
  expect(afters).toHaveLength(1);
  await verifyKey(t);
  // Read again once the 30 seconds are up, before the write has landed
  setSystemTime(new Date("2026-11-05T13:00:40Z"));
  await verifyKey(t);
  expect(afters).toHaveLength(1);
  setSystemTime(new Date("2026-11-05T13:11:00Z"));
  await verifyKey(t);
  expect(afters).toHaveLength(2);
  await afters[1]();
  expect(db.rows("agent_keys").find((k) => k.id === `key-${t}`)!.used_at).toBe("2026-11-05T13:11:00+00:00");
  setSystemTime();
});
