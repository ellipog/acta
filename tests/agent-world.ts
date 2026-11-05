import { createHash } from "node:crypto";
import { FakeSupabase } from "./fake-supabase";

// A small workspace for the agent API tests: one board with tasks in every column, a deleted one, and a key

export const me = "aaaaaaaa-0000-4000-8000-000000000001";
export const sam = "aaaaaaaa-0000-4000-8000-000000000002";
export const boardId = "bbbbbbbb-0000-4000-8000-000000000001";
export const token = `acta_${"k".repeat(32)}`;

export const agent = {
  keyId: "cccccccc-0000-4000-8000-000000000001",
  hash: createHash("sha256").update(token).digest("hex"),
  userId: me,
  name: "Script",
  access: "write" as const,
  workspaces: null,
};

const columns: [string, number][] = [
  ["todo", 4],
  ["in_progress", 3],
  ["review", 2],
  ["done", 2],
];

export function seed(db: FakeSupabase) {
  db.calls = [];
  db.applied = [];
  db.rounds = 0;
  db.refuse = null;
  db.behind = false;
  const w = { id: "dddddddd-0000-4000-8000-000000000001", slug: "aaen", name: "Aaen" };
  const tasks: Record<string, unknown>[] = [];
  let n = 1;
  for (const [status, count] of columns)
    for (let i = 0; i < count; i++, n++)
      tasks.push({
        board_id: boardId,
        number: n,
        title: `Task ${n}`,
        status,
        priority: "none",
        size: null,
        project: null,
        labels: n === 2 ? ["Bug"] : [],
        start_on: null,
        due_on: null,
        assignee: n === 5 ? sam : null,
        description: `About task ${n}`,
        subtasks: n === 1 ? [{ id: "s0000001", title: "Write it", done: false }] : [],
        public: false,
        shipped_on: status === "done" ? "2026-10-30" : null,
        vote_count: 0,
        position: i,
        origin: null,
        custom: {},
        archived_at: null,
        closed_at: status === "done" ? "2026-10-30T10:00:00+00:00" : null,
        created_at: `2026-10-${10 + n}T09:00:00+00:00`,
        updated_at: `2026-10-${10 + n}T09:00:00+00:00`,
        deleted_at: null,
      });
  tasks.push({ ...tasks[0], number: 12, title: "Task 12", subtasks: [], position: 9, deleted_at: "2026-10-31T09:00:00+00:00" });
  db.tables = {
    agent_keys: [
      {
        id: agent.keyId,
        hash: agent.hash,
        user_id: me,
        name: agent.name,
        access: agent.access,
        workspaces: null,
        used_at: new Date().toISOString(),
      },
    ],
    workspaces: [w],
    profiles: [
      { id: me, name: "Robin" },
      { id: sam, name: "Sam" },
    ],
    members: [
      { workspace_id: w.id, user_id: me, role: "owner", permissions: null, created_at: "2026-10-01T09:00:00+00:00" },
      { workspace_id: w.id, user_id: sam, role: "member", permissions: null, created_at: "2026-10-02T09:00:00+00:00" },
    ],
    boards: [
      {
        id: boardId,
        workspace_id: w.id,
        slug: "acta",
        name: "Acta",
        prefix: "ACT",
        next_number: 13,
        labels: [
          { id: "Bug", tone: "lapis" },
          { id: "Feature", tone: "pyrite" },
        ],
        projects: [{ name: "Launch", tone: "ink" }],
        roadmap_public: false,
        page: {},
        fields: [{ id: "f0000001", name: "Customer", type: "text" }],
        status_names: null,
        icon: "box",
        position: 0,
        created_at: "2026-10-01T09:00:00+00:00",
      },
    ],
    tasks,
    comments: [],
    activity: [],
    task_links: [],
    github_repos: [],
    suggestions: [],
  };
}

/** The board's tasks as the database holds them, for comparing what two ways of saving left behind */
export function state(db: FakeSupabase) {
  return {
    tasks: db
      .rows("tasks")
      .map((t) => ({
        number: t.number,
        title: t.title,
        status: t.status,
        position: t.position,
        priority: t.priority,
        assignee: t.assignee,
        labels: t.labels,
        subtasks: (t.subtasks as { title: string; done: boolean }[]).map((s) => `${s.title}${s.done ? " ✓" : ""}`),
        shipped_on: t.shipped_on,
        archived: Boolean(t.archived_at),
        custom: t.custom,
        deleted: Boolean(t.deleted_at),
      }))
      .sort((a, b) => (a.number as number) - (b.number as number)),
    activity: db.rows("activity").map((a) => `${a.number}: ${a.text}`),
  };
}

/** A tool's answer with what changes from run to run taken out */
export const steady = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value)
      .replace(/\d{4}-\d\d-\d\dT[0-9:.]+(Z|[+-]\d\d:\d\d)/g, "<time>")
      .replace(/"s[0-9a-f]{8}"/g, '"<subtask>"'),
  );
