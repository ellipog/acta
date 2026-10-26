export type StatusCategory = "backlog" | "todo" | "in_progress" | "review" | "done";
export type Priority = "urgent" | "high" | "medium" | "low" | "none";
export type Size = "xs" | "s" | "m" | "l" | "xl";
export type Tone = "lapis" | "pyrite" | "malachite" | "hematite";

export type Person = { id: string; name: string; tone: Tone; avatar?: string | null };
// via names the agent key a change came through, when it wasn't made in the app
export type Activity = { id?: string; at: number; who: string; text: string; via?: string };
export type Subtask = { id: string; title: string; done: boolean };
export type Comment = { id: string; who: string; at: number; body: string; via?: string };

export type Task = {
  id: string;
  title: string;
  status: StatusCategory;
  priority: Priority;
  size?: Size;
  project?: string;
  labels: string[];
  start?: string;
  due?: string;
  assignee?: string;
  description: string;
  subtasks: Subtask[];
  comments: number;
  thread?: Comment[];
  activity: Activity[];
  public?: boolean;
  votes?: number;
  voted?: boolean;
  shipped?: string;
  origin?: string;
};

export type Suggestion = {
  id: string;
  title: string;
  details?: string;
  by: string;
  at: number;
  votes: number;
  voted?: boolean;
};

export type PageLayout = "stages" | "timeline" | "list";

export type PublicPage = {
  title: string;
  tagline: string;
  slug: string;
  layout: PageLayout;
  accent: Tone;
  art: string;
  stageNames: Record<Stage, string>;
  ideaOne: string;
  ideaMany: string;
  ideaPrompt: string;
  voting: boolean;
  ideas: boolean;
  ideasPublic: boolean;
  showShipped: boolean;
  showDates: boolean;
  showProgress: boolean;
  showTeam: boolean;
  sort: "votes" | "date";
  zoom: "month" | "quarter" | "year";
  timelineGroup: "stage" | "project";
  newTasksPublic: boolean;
};

export const defaultPage: PublicPage = {
  title: "Portfolio site",
  tagline:
    "What we’re building, what’s next, and what’s shipped. Vote for what matters to you, or tell us what’s missing.",
  slug: "portfolio-site",
  layout: "stages",
  accent: "lapis",
  art: "crystal-cluster",
  stageNames: { planned: "Planned", progress: "In progress", shipped: "Shipped" },
  ideaOne: "idea",
  ideaMany: "ideas",
  ideaPrompt: "What would make this better for you?",
  voting: true,
  ideas: true,
  ideasPublic: true,
  showShipped: true,
  showDates: true,
  showProgress: true,
  showTeam: false,
  sort: "votes",
  zoom: "quarter",
  timelineGroup: "stage",
  newTasksPublic: false,
};

export const pageFrom = (name: string, slug: string, page: object): PublicPage => ({
  ...defaultPage,
  title: name,
  ...(page as Partial<PublicPage>),
  slug,
  stageNames: { ...defaultPage.stageNames, ...((page as Partial<PublicPage>).stageNames ?? {}) },
});

export type BoardState = {
  next: number;
  tasks: Record<string, Task>;
  columns: Record<StatusCategory, string[]>;
  roadmap: { public: boolean; suggestions: Suggestion[]; page: PublicPage };
};

export const statuses: { id: StatusCategory; title: string; rock: string }[] = [
  { id: "todo", title: "Todo", rock: "Kaibab" },
  { id: "in_progress", title: "In progress", rock: "Coconino" },
  { id: "review", title: "In review", rock: "Redwall" },
  { id: "done", title: "Done", rock: "Vishnu" },
];

export const statusTitle: Record<StatusCategory, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  review: "In review",
  done: "Done",
};

export const priorities: { id: Priority; title: string }[] = [
  { id: "urgent", title: "Urgent" },
  { id: "high", title: "High" },
  { id: "medium", title: "Medium" },
  { id: "low", title: "Low" },
  { id: "none", title: "No priority" },
];

export const sizes: { id: Size; title: string }[] = [
  { id: "xs", title: "XS" },
  { id: "s", title: "S" },
  { id: "m", title: "M" },
  { id: "l", title: "L" },
  { id: "xl", title: "XL" },
];

export const sizePoints: Record<Size, number> = { xs: 1, s: 2, m: 3, l: 5, xl: 8 };

export const priorityRank: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

export type Label = { id: string; tone: Tone };
export type Project = { name: string; tone: Tone | "ink" };
export type BoardMeta = {
  me: string;
  meId: string;
  people: Person[];
  labels: Label[];
  projects: Project[];
  workspace: string;
  team: string;
  prefix: string;
  live: boolean;
};

export const demoMeta: BoardMeta = {
  me: "You",
  meId: "elliot",
  workspace: "ellipog",
  team: "Ellipog Team",
  prefix: "ACT",
  live: false,
  people: [
    { id: "elliot", name: "Elliot Saaen", tone: "lapis" },
    { id: "mara", name: "Mara Lind", tone: "pyrite" },
    { id: "jon", name: "Jon Okafor", tone: "malachite" },
    { id: "ines", name: "Ines Varga", tone: "hematite" },
  ],
  labels: [
    { id: "Feature", tone: "lapis" },
    { id: "Bug", tone: "hematite" },
    { id: "Infra", tone: "pyrite" },
    { id: "Design", tone: "malachite" },
  ],
  projects: [
    { name: "Roadmap", tone: "lapis" },
    { name: "Views", tone: "pyrite" },
    { name: "Board", tone: "malachite" },
    { name: "Teams", tone: "hematite" },
    { name: "Polish", tone: "ink" },
  ],
};

export const people: Person[] = [...demoMeta.people];
export const labels: Label[] = [...demoMeta.labels];
export const projects: string[] = demoMeta.projects.map((p) => p.name);
export const projectTone: Record<string, Tone | "ink"> = Object.fromEntries(
  demoMeta.projects.map((p) => [p.name, p.tone]),
);
export const me = {
  name: demoMeta.me,
  id: demoMeta.meId,
  workspace: demoMeta.workspace,
  team: demoMeta.team,
  prefix: demoMeta.prefix,
  live: demoMeta.live,
};

export function setBoardMeta(meta: BoardMeta) {
  me.name = meta.me;
  me.id = meta.meId;
  me.workspace = meta.workspace;
  me.team = meta.team;
  me.prefix = meta.prefix;
  me.live = meta.live;
  people.splice(0, people.length, ...meta.people);
  labels.splice(0, labels.length, ...meta.labels);
  projects.splice(0, projects.length, ...meta.projects.map((p) => p.name));
  for (const key of Object.keys(projectTone)) delete projectTone[key];
  for (const p of meta.projects) projectTone[p.name] = p.tone;
}

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

export const nextTaskId = (state: BoardState) => `${me.prefix}-${state.next}`;

export const personById = (id?: string) => people.find((p) => p.id === id);
export const labelTone = (id: string) => labels.find((l) => l.id === id)?.tone ?? "lapis";
export const updatedAt = (t: Task) => t.activity.at(-1)?.at ?? 0;

export type Stage = "planned" | "progress" | "shipped";
export const stageOf = (t: Task): Stage =>
  t.status === "done" ? "shipped" : t.status === "todo" || t.status === "backlog" ? "planned" : "progress";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDue(due?: string) {
  if (!due) return "";
  const [, m, d] = due.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function timeAgo(at: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoToday = () => {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};

const H = 3600_000;
const D = 24 * H;
const T0 = Date.UTC(2026, 9, 25, 9);

function seedTask(t: Partial<Task> & Pick<Task, "id" | "title" | "status" | "priority">): Task {
  return {
    labels: [],
    description: "",
    subtasks: [],
    comments: 0,
    activity: [{ at: T0 - 9 * D, who: "Elliot", text: "created the task" }],
    ...t,
  };
}

const sub = (titles: string[], done: number): Subtask[] =>
  titles.map((title, i) => ({ id: `s${i}`, title, done: i < done }));

const seedTasks: Task[] = [
  seedTask({
    id: "ACT-51",
    title: "Votes need a rate limit per user",
    status: "todo",
    priority: "urgent",
    size: "s",
    project: "Roadmap",
    start: "2026-10-23",
    labels: ["Bug"],
    assignee: "mara",
    comments: 2,
    due: "2026-10-27",
    description:
      "A single account can upvote the same item repeatedly by double-clicking. Limit to one vote per user per item, and cap suggestions at ten a day.",
    activity: [
      { at: T0 - 2 * D, who: "Mara", text: "created the task" },
      { at: T0 - 2 * D + H, who: "Elliot", text: "set priority to Urgent" },
    ],
  }),
  seedTask({
    id: "ACT-55",
    title: "Command palette: jump to any task",
    status: "todo",
    priority: "low",
    size: "m",
    project: "Polish",
    start: "2026-11-17",
    labels: ["Feature"],
    assignee: "jon",
    due: "2026-12-02",
    subtasks: sub(["Index task titles", "Fuzzy match", "Recent tasks on open"], 0),
  }),
  seedTask({
    id: "ACT-60",
    title: "Empty states for every view",
    status: "todo",
    priority: "medium",
    size: "s",
    project: "Polish",
    labels: ["Design"],
    assignee: "ines",
    activity: [{ at: T0 - 20 * H, who: "Ines", text: "created the task" }],
  }),
  seedTask({
    id: "ACT-62",
    title: "Calendar view for due dates",
    status: "todo",
    priority: "medium",
    size: "l",
    project: "Views",
    start: "2026-11-23",
    due: "2026-12-11",
    labels: ["Feature"],
    public: true,
    votes: 94,
    description: "Tasks laid out on a month grid by due date. Drag a task to another day to move its due date.",
    activity: [{ at: T0 - 12 * D, who: "Elliot", text: "accepted a suggestion from the roadmap" }],
  }),
  seedTask({
    id: "ACT-63",
    title: "Recurring tasks",
    status: "todo",
    priority: "low",
    size: "m",
    project: "Board",
    labels: ["Feature"],
    public: true,
    votes: 128,
    description: "Daily, weekly, or on a chosen weekday. A new task is created when the last one is done.",
    activity: [{ at: T0 - 15 * D, who: "Mara", text: "created the task" }],
  }),
  seedTask({
    id: "ACT-64",
    title: "Sync issues and pull requests from GitHub",
    status: "todo",
    priority: "none",
    size: "xl",
    project: "Teams",
    start: "2027-01-04",
    due: "2027-02-12",
    labels: ["Infra"],
    public: true,
    votes: 61,
    activity: [{ at: T0 - 30 * D, who: "Jon", text: "created the task" }],
  }),
  seedTask({
    id: "ACT-42",
    title: "Ship the public roadmap page",
    status: "in_progress",
    priority: "high",
    size: "l",
    project: "Roadmap",
    start: "2026-10-19",
    labels: ["Feature"],
    assignee: "elliot",
    due: "2026-11-12",
    comments: 4,
    public: true,
    votes: 212,
    thread: [
      {
        id: "c1",
        who: "Mara",
        at: T0 - 26 * H,
        body: "Should **Shipped** show dates? Visitors seem to like knowing *when*, not just *what*.",
      },
      {
        id: "c2",
        who: "Elliot",
        at: T0 - 20 * H,
        body: "Yes, grouped by month. Also:\n\n- keep votes visible after shipping\n- link each item to its changelog entry",
      },
      {
        id: "c3",
        who: "Jon",
        at: T0 - 7 * H,
        body: "The public view only exposes `title`, `status` and `votes`. @Mara can you check the RLS policy?",
      },
      {
        id: "c4",
        who: "Mara",
        at: T0 - 5 * H,
        body: "Checked, it's tight. One nit: rate limits are tracked in [ACT-51](/demo).",
      },
    ],
    description:
      "Opt-in per board. Public tasks grouped as Planned, In progress and Shipped, served from a view that only exposes safe columns.",
    subtasks: sub(
      ["Public view in Postgres", "Roadmap page layout", "Vote button", "Suggestion form", "Rate limits"],
      3,
    ),
    activity: [
      { at: T0 - 6 * D, who: "Elliot", text: "created the task" },
      { at: T0 - 4 * D, who: "Elliot", text: "moved it to In progress" },
      { at: T0 - 5 * H, who: "Mara", text: "commented" },
    ],
  }),
  seedTask({
    id: "ACT-45",
    title: "Custom fields: number and single select",
    status: "in_progress",
    priority: "high",
    size: "l",
    project: "Views",
    start: "2026-10-13",
    labels: ["Feature"],
    assignee: "mara",
    due: "2026-11-05",
    public: true,
    votes: 176,
    comments: 3,
    subtasks: sub(["Field types table", "Number field", "Select options editor", "Table column per field"], 2),
    activity: [
      { at: T0 - 8 * D, who: "Mara", text: "created the task" },
      { at: T0 - 3 * H, who: "Mara", text: "completed “Number field”" },
    ],
  }),
  seedTask({
    id: "ACT-38",
    title: "Table view: inline editing for select fields",
    status: "in_progress",
    priority: "medium",
    size: "m",
    project: "Views",
    start: "2026-10-21",
    labels: ["Feature"],
    assignee: "jon",
    due: "2026-11-18",
    subtasks: sub(["Status", "Priority", "Custom selects", "Keyboard navigation"], 1),
    activity: [{ at: T0 - 26 * H, who: "Jon", text: "completed “Status”" }],
  }),
  seedTask({
    id: "ACT-49",
    title: "Daily email digest of the inbox",
    status: "in_progress",
    priority: "medium",
    size: "m",
    project: "Teams",
    start: "2026-10-20",
    labels: ["Feature"],
    assignee: "ines",
    due: "2026-10-24",
    comments: 1,
    subtasks: sub(["Digest query", "Email template", "Unsubscribe link"], 1),
    activity: [{ at: T0 - 2 * D, who: "Ines", text: "moved it to In progress" }],
  }),
  seedTask({
    id: "ACT-47",
    title: "Fractional positions for drag and drop",
    status: "review",
    priority: "high",
    size: "l",
    project: "Board",
    start: "2026-10-12",
    due: "2026-10-29",
    labels: ["Infra"],
    assignee: "elliot",
    comments: 7,
    description: "Store position as a fractional index so a drop only rewrites the moved card.",
    activity: [{ at: T0 - 7 * H, who: "Jon", text: "commented" }],
  }),
  seedTask({
    id: "ACT-52",
    title: "Markdown in comments",
    status: "review",
    priority: "medium",
    size: "s",
    project: "Board",
    start: "2026-10-22",
    labels: ["Feature"],
    assignee: "jon",
    due: "2026-10-28",
    public: true,
    votes: 52,
    activity: [{ at: T0 - 9 * H, who: "Jon", text: "moved it to In review" }],
  }),
  seedTask({
    id: "ACT-58",
    title: "Basalt dark theme pass",
    status: "review",
    priority: "low",
    size: "s",
    project: "Polish",
    start: "2026-10-19",
    due: "2026-10-30",
    labels: ["Design"],
    assignee: "ines",
    activity: [{ at: T0 - D, who: "Ines", text: "moved it to In review" }],
  }),
  seedTask({
    id: "ACT-31",
    title: "Realtime presence on boards",
    status: "done",
    priority: "high",
    size: "l",
    project: "Board",
    start: "2026-09-28",
    due: "2026-10-14",
    labels: ["Infra"],
    assignee: "elliot",
    public: true,
    votes: 119,
    shipped: "2026-10-14",
    activity: [{ at: Date.UTC(2026, 9, 14, 15), who: "Elliot", text: "moved it to Done" }],
  }),
  seedTask({
    id: "ACT-29",
    title: "Invite flow with email tokens",
    status: "done",
    priority: "medium",
    size: "m",
    project: "Teams",
    start: "2026-09-29",
    due: "2026-10-09",
    labels: ["Feature"],
    assignee: "mara",
    shipped: "2026-10-09",
    subtasks: sub(["Token table", "Accept page", "Email template"], 3),
    activity: [{ at: Date.UTC(2026, 9, 9, 11), who: "Mara", text: "moved it to Done" }],
  }),
  seedTask({
    id: "ACT-33",
    title: "Activity log trigger on tasks",
    status: "done",
    priority: "high",
    size: "xs",
    project: "Board",
    start: "2026-09-24",
    due: "2026-10-02",
    labels: ["Infra"],
    assignee: "elliot",
    comments: 3,
    shipped: "2026-10-02",
    activity: [{ at: Date.UTC(2026, 9, 2, 16), who: "Elliot", text: "moved it to Done" }],
  }),
  seedTask({
    id: "ACT-27",
    title: "Keyboard shortcuts everywhere",
    status: "done",
    priority: "medium",
    size: "m",
    project: "Polish",
    start: "2026-09-14",
    due: "2026-09-30",
    labels: ["Feature"],
    assignee: "ines",
    public: true,
    votes: 88,
    shipped: "2026-09-30",
    activity: [{ at: Date.UTC(2026, 8, 30, 10), who: "Ines", text: "moved it to Done" }],
  }),
  seedTask({
    id: "ACT-21",
    title: "Workspaces with roles",
    status: "done",
    priority: "high",
    size: "xl",
    project: "Teams",
    start: "2026-08-17",
    due: "2026-09-12",
    labels: ["Feature"],
    assignee: "mara",
    public: true,
    votes: 143,
    shipped: "2026-09-12",
    activity: [{ at: Date.UTC(2026, 8, 12, 14), who: "Mara", text: "moved it to Done" }],
  }),
];

const seedSuggestions: Suggestion[] = [
  {
    id: "sg1",
    title: "A timeline view with dependencies",
    by: "Priya",
    at: T0 - 3 * D,
    votes: 47,
    details: "Being able to say one task blocks another, and see the arrows on the timeline.",
  },
  {
    id: "sg2",
    title: "Post to Slack when something ships",
    by: "Tomás",
    at: T0 - 5 * D,
    votes: 33,
    details: "A message in a channel with the changelog entry, so the whole team hears about it.",
  },
  { id: "sg3", title: "Import a board from Trello", by: "Wen", at: T0 - 9 * H, votes: 21 },
  { id: "sg4", title: "Time tracking on tasks", by: "Anonymous", at: T0 - 11 * D, votes: 12 },
];

export function seedBoard(): BoardState {
  const tasks = Object.fromEntries(seedTasks.map((t) => [t.id, structuredClone(t)]));
  const columns = { backlog: [], todo: [], in_progress: [], review: [], done: [] } as BoardState["columns"];
  for (const t of seedTasks) columns[t.status].push(t.id);
  return {
    next: 65,
    tasks,
    columns,
    roadmap: { public: true, suggestions: structuredClone(seedSuggestions), page: structuredClone(defaultPage) },
  };
}

export function normalizeBoard(board: BoardState): BoardState {
  const page = board.roadmap?.page;
  return {
    ...board,
    roadmap: {
      public: board.roadmap?.public ?? true,
      suggestions: board.roadmap?.suggestions ?? [],
      page: { ...defaultPage, ...page, stageNames: { ...defaultPage.stageNames, ...page?.stageNames } },
    },
  };
}

export type BoardAction =
  | { type: "columns"; columns: BoardState["columns"] }
  | { type: "update"; id: string; patch: Partial<Task>; note?: string }
  | { type: "bulk"; ids: string[]; patch: Partial<Task>; note: string }
  | { type: "add"; status: StatusCategory; title: string; patch?: Partial<Task>; note?: string }
  | { type: "delete"; ids: string[] }
  | { type: "undelete"; items: { task: Task; index: number }[] }
  | { type: "toggleSubtask"; id: string; subId: string }
  | { type: "addSubtask"; id: string; title: string }
  | { type: "comment"; id: string; body: string }
  | { type: "vote"; id: string }
  | { type: "roadmap"; public: boolean }
  | { type: "suggest"; title: string; details?: string }
  | { type: "page"; patch: Partial<PublicPage> }
  | { type: "voteSuggestion"; id: string }
  | { type: "acceptSuggestion"; id: string }
  | { type: "declineSuggestion"; id: string }
  | { type: "reset"; state: BoardState };

const log = (task: Task, text: string): Task => ({
  ...task,
  activity: [...task.activity, { id: newId(), at: Date.now(), who: me.name, text }],
});

function patchTask(state: BoardState, id: string, patch: Partial<Task>, note?: string): BoardState {
  const prev = state.tasks[id];
  if (!prev) return state;
  let task = { ...prev, ...patch };
  const to = patch.status;
  if (to && to !== prev.status) {
    if (to === "done") task.shipped = isoToday();
    else if (prev.status === "done") task.shipped = undefined;
  }
  if (note) task = log(task, note);
  let columns = state.columns;
  // A drag has already placed the card in its new column
  if (to && to !== prev.status && !columns[to].includes(prev.id)) {
    columns = {
      ...columns,
      [prev.status]: columns[prev.status].filter((x) => x !== prev.id),
      [to]: [...columns[to], prev.id],
    };
  }
  return { ...state, columns, tasks: { ...state.tasks, [id]: task } };
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case "columns":
      return { ...state, columns: action.columns };

    case "update":
      return patchTask(state, action.id, action.patch, action.note);

    case "bulk":
      return action.ids.reduce((s, id) => patchTask(s, id, action.patch, action.note), state);

    case "add": {
      const id = nextTaskId(state);
      const status = action.patch?.status ?? action.status;
      const task: Task = {
        id,
        title: action.title,
        priority: "none",
        labels: [],
        description: "",
        subtasks: [],
        comments: 0,
        activity: [{ id: newId(), at: Date.now(), who: me.name, text: action.note ?? "created the task" }],
        ...(state.roadmap.page.newTasksPublic ? { public: true } : {}),
        ...action.patch,
        status,
      };
      return {
        ...state,
        next: state.next + 1,
        tasks: { ...state.tasks, [id]: task },
        columns: { ...state.columns, [status]: [...state.columns[status], id] },
      };
    }

    case "delete": {
      const gone = new Set(action.ids.filter((id) => state.tasks[id]));
      if (!gone.size) return state;
      const tasks = { ...state.tasks };
      for (const id of gone) delete tasks[id];
      const columns = Object.fromEntries(
        Object.entries(state.columns).map(([k, ids]) => [k, ids.filter((id) => !gone.has(id))]),
      ) as BoardState["columns"];
      return { ...state, tasks, columns };
    }

    case "undelete": {
      let next = state;
      // Lowest index first, so each lands where it was
      for (const { task, index } of [...action.items].sort((a, b) => a.index - b.index)) {
        if (next.tasks[task.id]) continue;
        const column = [...next.columns[task.status]];
        column.splice(Math.min(index, column.length), 0, task.id);
        next = {
          ...next,
          tasks: { ...next.tasks, [task.id]: task },
          columns: { ...next.columns, [task.status]: column },
        };
      }
      return next;
    }

    case "toggleSubtask": {
      const task = state.tasks[action.id];
      const subtask = task?.subtasks.find((s) => s.id === action.subId);
      if (!task || !subtask) return state;
      const next = log(
        { ...task, subtasks: task.subtasks.map((s) => (s.id === action.subId ? { ...s, done: !s.done } : s)) },
        `${subtask.done ? "reopened" : "completed"} “${subtask.title}”`,
      );
      return { ...state, tasks: { ...state.tasks, [task.id]: next } };
    }

    case "addSubtask": {
      const task = state.tasks[action.id];
      if (!task) return state;
      const next = log(
        { ...task, subtasks: [...task.subtasks, { id: `s${Date.now()}`, title: action.title, done: false }] },
        `added subtask “${action.title}”`,
      );
      return { ...state, tasks: { ...state.tasks, [task.id]: next } };
    }

    case "comment": {
      const task = state.tasks[action.id];
      if (!task) return state;
      const comment: Comment = { id: newId(), who: me.name, at: Date.now(), body: action.body };
      const next = log(
        { ...task, comments: task.comments + 1, thread: [...(task.thread ?? []), comment] },
        "commented",
      );
      return { ...state, tasks: { ...state.tasks, [task.id]: next } };
    }

    case "vote": {
      const task = state.tasks[action.id];
      if (!task) return state;
      const voted = !task.voted;
      return {
        ...state,
        tasks: {
          ...state.tasks,
          [task.id]: { ...task, voted, votes: Math.max(0, (task.votes ?? 0) + (voted ? 1 : -1)) },
        },
      };
    }

    case "roadmap":
      return { ...state, roadmap: { ...state.roadmap, public: action.public } };

    case "suggest": {
      const suggestion: Suggestion = {
        id: newId(),
        title: action.title,
        details: action.details,
        by: me.name,
        at: Date.now(),
        votes: 1,
        voted: true,
      };
      return { ...state, roadmap: { ...state.roadmap, suggestions: [suggestion, ...state.roadmap.suggestions] } };
    }

    case "page":
      return { ...state, roadmap: { ...state.roadmap, page: { ...state.roadmap.page, ...action.patch } } };

    case "voteSuggestion":
      return {
        ...state,
        roadmap: {
          ...state.roadmap,
          suggestions: state.roadmap.suggestions.map((s) =>
            s.id === action.id ? { ...s, voted: !s.voted, votes: Math.max(0, s.votes + (s.voted ? -1 : 1)) } : s,
          ),
        },
      };

    case "acceptSuggestion": {
      const s = state.roadmap.suggestions.find((x) => x.id === action.id);
      if (!s) return state;
      const without = {
        ...state,
        roadmap: { ...state.roadmap, suggestions: state.roadmap.suggestions.filter((x) => x !== s) },
      };
      return boardReducer(without, {
        type: "add",
        status: "todo",
        title: s.title,
        patch: {
          public: true,
          votes: s.votes,
          voted: s.voted,
          labels: labels.some((l) => l.id === "Feature") ? ["Feature"] : [],
          description: s.details ?? "",
          origin: s.id,
        },
        note: `accepted a suggestion from ${s.by}`,
      });
    }

    case "declineSuggestion":
      return {
        ...state,
        roadmap: { ...state.roadmap, suggestions: state.roadmap.suggestions.filter((x) => x.id !== action.id) },
      };

    case "reset":
      return action.state;
  }
}
