import { expect, test } from "bun:test";
import type { PublicRoadmapData, PublicTask } from "@/lib/public-roadmap";
import {
  ideaJson,
  isVisitor,
  originOf,
  queryTasks,
  readTaskQuery,
  roadmapCors,
  roadmapKeyShape,
  roadmapPage,
  shownTasks,
  taskJson,
  taskNumber,
  type TaskQuery,
} from "@/lib/roadmap-json";

// The roadmap API and the keyless feed hold only what the public page shows, and read their own query strings
// strictly, so a site building on them gets an answer it can rely on or a reason it can fix

const task = (number: number, patch: Partial<PublicTask> = {}): PublicTask => ({
  number,
  title: `Task ${number}`,
  status: "todo",
  project: "Web",
  labels: ["Feature"],
  opened: null,
  closed: null,
  start_on: null,
  due_on: "2026-12-01",
  shipped_on: null,
  description: "",
  subtasks: [
    { id: "a", done: true },
    { id: "b", done: false },
  ],
  votes: 0,
  voted: false,
  assignee: { id: "u", name: "Sam", avatar: null },
  ...patch,
});

const roadmap = (page: object, tasks: PublicTask[]): PublicRoadmapData => ({
  workspace: { name: "Acme", slug: "acme", sigil: "crystal-cluster", tone: "lapis" },
  board: { id: "b", name: "Web", slug: "web", prefix: "WEB", projects: [], page },
  tasks,
  suggestions: [{ id: "s1", title: "Dark mode", details: null, by: "A visitor", at: "2026-10-01T09:00:00Z", votes: 4, voted: true }],
});

const query = (s: string) => readTaskQuery(new URLSearchParams(s));

test("a task holds only what its page shows", () => {
  const t = task(3, {
    status: "done",
    shipped_on: "2026-10-02",
    opened: "2026-10-01T09:00:00Z",
    closed: "2026-10-04T09:00:00Z",
    votes: 5,
    voted: true,
  });
  const bare = roadmap({ voting: false, showDates: false, showProgress: false, showProjects: false }, [t]);
  const hidden = taskJson(bare, roadmapPage(bare), t);
  expect(hidden.id).toBe("WEB-3");
  expect(hidden.stage).toBe("shipped");
  expect(hidden.stage_name).toBe("Shipped");
  expect(hidden.project).toBeNull();
  expect(hidden.due).toBeNull();
  expect(hidden.subtasks).toBeNull();
  expect(hidden.votes).toBeNull();
  expect("voted" in hidden).toBe(false);

  const full = roadmap({ voting: true, showDates: true, showProgress: true, showProjects: true }, [t]);
  const shown = taskJson(full, roadmapPage(full), t, { visitor: true });
  expect(shown.project).toBe("Web");
  expect(shown.due).toBe("2026-12-01");
  expect(shown.subtasks).toEqual({ done: 1, total: 2 });
  expect(shown.votes).toBe(5);
  expect(shown.voted).toBe(true);
  expect(shown.time_to_close).toEqual({ seconds: 3 * 86_400, text: "3 days" });

  // Work that isn't shipped has no time to close, even with both times
  const open = taskJson(full, roadmapPage(full), { ...t, status: "in_progress" });
  expect(open.time_to_close).toBeNull();

  const page = roadmapPage(bare);
  expect(ideaJson(page, bare.suggestions[0]).votes).toBeNull();
  expect(ideaJson(roadmapPage(full), full.suggestions[0], { visitor: true })).toMatchObject({ votes: 4, voted: true });
});

test("canceled work never shows, and shipped work only where the page lists it", () => {
  const tasks = [task(1), task(2, { status: "done" }), task(3, { status: "canceled" })];
  const on = roadmap({ showShipped: true }, tasks);
  expect(shownTasks(on, roadmapPage(on)).map((t) => t.number)).toEqual([1, 2]);
  const off = roadmap({ showShipped: false }, tasks);
  expect(shownTasks(off, roadmapPage(off)).map((t) => t.number)).toEqual([1]);
});

test("a list request reads what it knows and says what it doesn't", () => {
  expect(query("")).toEqual({});
  expect(query("stage=planned,shipped&stage=progress&label=Bug&sort=votes&limit=20&offset=40")).toEqual({
    stage: ["planned", "shipped", "progress"],
    label: "Bug",
    sort: "votes",
    limit: 20,
    offset: 40,
  });
  expect(query("stage=later")).toBe("stage must be planned, progress or shipped, not “later”.");
  expect(query("sort=random")).toBeString();
  expect(query("limit=0")).toBeString();
  expect(query("limit=201")).toBeString();
  expect(query("limit=1.5")).toBeString();
  expect(query("offset=-1")).toBeString();
  expect(query("q=" + "x".repeat(300))).toEqual({ q: "x".repeat(200) });
});

test("lists filter, sort the same way every time, and page", () => {
  const data = roadmap({ voting: true, showDates: true, showProjects: true, showShipped: true }, [
    task(1, { votes: 2, labels: ["Bug"], title: "Fix the login" }),
    task(2, { votes: 9, project: "App", due_on: "2026-11-01" }),
    task(3, { votes: 2, status: "done", shipped_on: "2026-10-20", opened: "2026-09-01T00:00:00Z" }),
    task(4, { votes: 0, status: "in_progress", due_on: null, description: "The **login** page" }),
  ]);
  const page = roadmapPage(data);
  const all = shownTasks(data, page).map((t) => taskJson(data, page, t));
  const ids = (q: TaskQuery) => queryTasks(all, q).tasks.map((t) => t.number);

  expect(ids({})).toEqual([1, 2, 3, 4]);
  expect(ids({ sort: "votes" })).toEqual([2, 1, 3, 4]);
  expect(ids({ sort: "due" })).toEqual([2, 1, 3, 4]);
  expect(ids({ sort: "shipped" })).toEqual([3, 1, 2, 4]);
  // By number, unless the page shows when each was made. Then an import made later can still be older
  expect(ids({ sort: "newest" })).toEqual([4, 3, 2, 1]);
  const at = (n: number, opened: string) => ({ ...all[n - 1], opened });
  const timed = [at(1, "2026-10-03T00:00:00Z"), at(2, "2026-10-02T00:00:00Z"), at(3, "2026-08-01T00:00:00Z"), at(4, "2026-10-01T00:00:00Z")];
  expect(queryTasks(timed, { sort: "newest" }).tasks.map((t) => t.number)).toEqual([1, 2, 4, 3]);
  expect(ids({ stage: ["planned"] })).toEqual([1, 2]);
  expect(ids({ project: "app" })).toEqual([2]);
  expect(ids({ label: "bug" })).toEqual([1]);
  expect(ids({ q: "LOGIN" })).toEqual([1, 4]);

  const paged = queryTasks(all, { limit: 2, offset: 1 });
  expect(paged.total).toBe(4);
  expect(paged.tasks.map((t) => t.number)).toEqual([2, 3]);
});

test("a task is named by its id or number, on its own board only", () => {
  expect(taskNumber("WEB-12", "WEB")).toBe(12);
  expect(taskNumber("web-12", "WEB")).toBe(12);
  expect(taskNumber("12", "WEB")).toBe(12);
  expect(taskNumber("ACT-12", "WEB")).toBeNull();
  expect(taskNumber("WEB-", "WEB")).toBeNull();
  expect(taskNumber("12a", "WEB")).toBeNull();
});

test("keys, visitors and sites are checked for their shape", () => {
  expect(roadmapKeyShape.test(`acta_pk_${"a1".repeat(32)}`)).toBe(true);
  expect(roadmapKeyShape.test("acta_pk_short")).toBe(false);
  expect(roadmapKeyShape.test(`acta_${"a1".repeat(32)}`)).toBe(false);

  expect(isVisitor("user-48213")).toBe(true);
  expect(isVisitor("short")).toBe(false);
  expect(isVisitor("someone@yourco.com")).toBe(false);
  expect(isVisitor(42)).toBe(false);

  expect(originOf("https://YourCo.com/roadmap?x=1")).toBe("https://yourco.com");
  expect(originOf("yourco.com")).toBe("https://yourco.com");
  expect(originOf("http://localhost:3000")).toBe("http://localhost:3000");
  expect(originOf("ftp://yourco.com")).toBeNull();
  expect(originOf("https://my_site.com")).toBeNull();
  expect(originOf("not a site")).toBeNull();
  expect(originOf("  ")).toBeNull();
});

test("a key with sites answers only their pages, and servers", () => {
  const open = roadmapCors([], "https://anywhere.com");
  expect(open.allowed).toBe(true);
  expect(open.headers["Access-Control-Allow-Origin"]).toBe("*");

  const sites = ["https://yourco.com"];
  const ours = roadmapCors(sites, "https://YourCo.com");
  expect(ours.allowed).toBe(true);
  expect(ours.headers["Access-Control-Allow-Origin"]).toBe("https://YourCo.com");
  expect(ours.headers.Vary).toBe("Origin");

  const theirs = roadmapCors(sites, "https://elsewhere.com");
  expect(theirs.allowed).toBe(false);
  expect(theirs.headers["Access-Control-Allow-Origin"]).toBeUndefined();

  expect(roadmapCors(sites, null).allowed).toBe(true);
});
