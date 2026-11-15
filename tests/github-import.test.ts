import { expect, mock, test } from "bun:test";
import { fakeSupabase as db } from "./fake-supabase";
import { boardId, me, sam, seed } from "./agent-world";

// Bringing a repository's issues over when it starts syncing them: every issue becomes a task with its comments and
// its link, each GitHub account is looked up once rather than once an issue, and comments are read a few issues at
// a time rather than one issue after another

mock.module("server-only", () => ({}));
mock.module("@/lib/supabase/admin", () => ({ createAdminClient: () => db, serviceReady: true }));

const repo = 4242;
const issues = Array.from({ length: 30 }, (_, i) => ({
  number: i + 1,
  title: `Issue ${i + 1}`,
  body: `About issue ${i + 1}`,
  state: i % 3 === 0 ? "closed" : "open",
  state_reason: i % 3 === 0 ? "completed" : null,
  closed_at: i % 3 === 0 ? "2026-10-20T09:00:00Z" : null,
  created_at: `2026-10-01T09:${String(i).padStart(2, "0")}:00Z`,
  html_url: `https://github.com/acme/app/issues/${i + 1}`,
  user: { login: "octo", id: 1 },
  assignee: i % 2 ? { login: "robin", id: 11 } : { login: "sam", id: 12 },
  labels: i === 0 ? [{ name: "Bug" }] : [],
  comments: i < 12 ? 2 : 0,
}));

let out = 0;
let most = 0;
const asked: string[] = [];
mock.module("@/lib/github/app", () => ({
  githubReady: true,
  botLogin: () => "acta[bot]",
  GitHubError: class extends Error {},
  github: async () => ({}),
  githubAll: async (_: number, path: string) => {
    asked.push(path);
    if (path.includes("/issues?")) return issues;
    const n = Number(path.match(/issues\/(\d+)\/comments/)![1]);
    out++;
    most = Math.max(most, out);
    await new Promise((r) => setTimeout(r, 5));
    out--;
    return [
      { body: `First on ${n}`, user: { login: "octo" }, created_at: "2026-10-02T09:00:00Z" },
      { body: "From the app", user: { login: "acta[bot]" }, created_at: "2026-10-02T10:00:00Z" },
    ];
  },
}));

const { handleDelivery, importIssues } = await import("@/lib/github/sync");

// A board with this repository linked, and pull requests #45 and #46 linked to ACT-1 and ACT-2
function linked() {
  seed(db);
  db.tables.github_repos = [
    { id: repo, installation_id: 7, board_id: boardId, full_name: "acme/app", private: false, settings: {} },
  ];
  const pr = (number: number, ref: string, extra: Record<string, unknown>) => ({
    id: `link-${ref}`,
    board_id: boardId,
    number,
    repo_id: repo,
    kind: "pr",
    ref,
    url: `https://github.com/acme/app/pull/${ref}`,
    state: "open",
    closes: false,
    extra,
    updated_at: "2026-10-25T09:00:00+00:00",
  });
  db.tables.task_links = [pr(1, "45", { checks: "failure" }), pr(2, "46", { review: "approved" })];
  db.tables.github_deliveries = [];
  db.calls = [];
}
let delivery = 0;
const deliver = (event: string, p: Record<string, unknown>) =>
  handleDelivery(event, `d${++delivery}`, { repository: { id: repo }, sender: { login: "octo" }, ...p });
const extra = (ref: string) => db.rows("task_links").find((l) => l.ref === ref)!.extra;

test("an issue import brings every issue over with its comments and link, in few round trips", async () => {
  seed(db);
  db.tables.github_repos = [
    { id: repo, installation_id: 7, board_id: boardId, full_name: "acme/app", private: false, settings: { issues: true } },
  ];
  db.tables.github_accounts = [
    { workspace_id: db.tables.workspaces[0].id, github_id: "11", user_id: me },
    { workspace_id: db.tables.workspaces[0].id, github_id: "12", user_id: sam },
  ];
  db.calls = [];
  db.rounds = 0;
  expect(await importIssues(repo)).toBe(30);

  const made = db.rows("tasks").filter((t) => (t.number as number) >= 13);
  expect(made.map((t) => t.title)).toEqual(issues.map((i) => i.title));
  expect(made.map((t) => t.assignee)).toEqual(issues.map((i) => (i.assignee.id === 11 ? me : sam)));
  expect(made.filter((t) => t.status === "done").length).toBe(10);
  // The app's own comments stay behind
  expect(db.rows("comments").map((c) => c.body)).toEqual(issues.slice(0, 12).map((i) => `First on ${i.number}`));
  const links = db.rows("task_links").filter((l) => l.kind === "issue");
  expect(links.map((l) => [l.number, l.ref])).toEqual(made.map((t, i) => [t.number, String(i + 1)]));

  // Two accounts, asked once each
  expect(db.calls.filter((c) => c === "rpc github_member").length).toBe(2);
  // Twelve issues have comments, read five at a time
  expect(asked.filter((p) => p.includes("/comments")).length).toBe(12);
  expect(most).toBe(5);
  // Round trips that wait on each other: 97 when each issue was put together one after another
  expect(db.rounds).toBeLessThanOrEqual(12);
  // A second import finds nothing new
  expect(await importIssues(repo)).toBe(0);
});

test("a push to a linked pull request's branch writes nothing", async () => {
  linked();
  await deliver("pull_request", {
    action: "synchronize",
    pull_request: { number: 45, title: "ACT-1 Fix it", body: "", head: { ref: "act-1-fix" }, state: "open" },
  });
  expect(db.calls.filter((c) => !c.startsWith("select"))).toEqual(["upsert github_deliveries"]);
});

test("a finished check suite notes its result only on links where it changed, keeping what else they knew", async () => {
  linked();
  await deliver("check_suite", {
    action: "completed",
    check_suite: { conclusion: "failure", pull_requests: [{ number: 45 }, { number: 46 }, { number: 46 }] },
  });
  expect(extra("45")).toEqual({ checks: "failure" });
  expect(extra("46")).toEqual({ review: "approved", checks: "failure" });
  expect(db.calls.filter((c) => c === "update task_links").length).toBe(1);
  // Checks still running say nothing
  db.calls = [];
  await deliver("check_suite", { action: "requested", check_suite: { pull_requests: [{ number: 45 }] } });
  expect(db.calls.filter((c) => c === "update task_links")).toEqual([]);
});

test("a review that approves or asks for changes is noted on the pull request's link", async () => {
  linked();
  await deliver("pull_request_review", { review: { state: "CHANGES_REQUESTED" }, pull_request: { number: 45 } });
  expect(extra("45")).toEqual({ checks: "failure", review: "changes_requested" });
  await deliver("pull_request_review", { review: { state: "commented" }, pull_request: { number: 46 } });
  expect(extra("46")).toEqual({ review: "approved" });
});
