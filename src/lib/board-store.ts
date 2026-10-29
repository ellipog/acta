// canceled is closed without being done, for work that won't happen
export type StatusCategory = "backlog" | "todo" | "in_progress" | "review" | "done" | "canceled";
export type Priority = "urgent" | "high" | "medium" | "low" | "none";
export type Size = "xs" | "s" | "m" | "l" | "xl";
export type Tone = "lapis" | "pyrite" | "malachite" | "hematite";

export type Person = { id: string; name: string; tone: Tone; avatar?: string | null };
// via names the agent key a change came through, when it wasn't made in the app
export type Activity = { id?: string; at: number; who: string; text: string; via?: string };
export type Subtask = { id: string; title: string; done: boolean };
// from names the original author of a comment an agent brought in from elsewhere, like a GitHub issue
export type Comment = { id: string; who: string; at: number; body: string; via?: string; from?: string };

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
  // When it was put away. Archived tasks leave the board without being deleted
  archived?: string;
  origin?: string;
  // Values for the board's own fields, by field id
  custom?: Record<string, CustomValue>;
};

// Fields a board adds to its tasks, beyond the ones every board has
export type FieldType = "text" | "number" | "date" | "select" | "multi";
export type CustomField = { id: string; name: string; type: FieldType; options?: string[] };
// Text and dates are strings, numbers are numbers, and a multi select is a list of its options
export type CustomValue = string | number | string[];

export const fieldTypes: { id: FieldType; title: string }[] = [
  { id: "text", title: "Text" },
  { id: "number", title: "Number" },
  { id: "date", title: "Date" },
  { id: "select", title: "Single select" },
  { id: "multi", title: "Multi select" },
];

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
export type PageSection = "roadmap" | "ideas" | "shipped";
export type PageLink = { label: string; url: string };

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
  // Public, but kept out of search engines and the sitemap, for a page meant only for those with the link
  hideFromSearch: boolean;
  // The page's own look. "visitor" leaves light or dark to whoever reads it
  theme: "visitor" | "light" | "dark";
  // A colour of the page's own in place of the accent, as #rrggbb, or empty
  color: string;
  hero: "plate" | "banner" | "centered" | "plain";
  headingFont: "display" | "sans" | "serif" | "mono";
  width: "normal" | "wide";
  density: "comfortable" | "compact";
  // A line across the top, for news. Empty hides it
  announcement: string;
  announcementLink: string;
  // A button beside the title, and a few links under it
  cta: PageLink;
  links: PageLink[];
  // Which parts come first. The roadmap, ideas and shipped work can go in any order
  sections: PageSection[];
  showStats: boolean;
  showSearch: boolean;
  showNotes: boolean;
  showProjects: boolean;
  // How many shipped items the changelog lists, 0 for all of them
  shippedLimit: number;
  shippedByMonth: boolean;
  footer: string;
  // The owner's own code. CSS applies inside the page only, and the HTML shows above the page and above its footer
  // in a sandboxed frame, so nothing in it can reach the visitor's session or the rest of Acta
  css: string;
  headerHtml: string;
  footerHtml: string;
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
  hideFromSearch: false,
  theme: "visitor",
  color: "",
  hero: "plate",
  headingFont: "display",
  width: "normal",
  density: "comfortable",
  announcement: "",
  announcementLink: "",
  cta: { label: "", url: "" },
  links: [],
  sections: ["roadmap", "ideas", "shipped"],
  showStats: true,
  showSearch: true,
  showNotes: true,
  showProjects: true,
  shippedLimit: 0,
  shippedByMonth: false,
  footer: "",
  css: "",
  headerHtml: "",
  footerHtml: "",
};

export const pageLimits = { text: 120, long: 600, url: 300, links: 4, css: 12000, html: 12000 };

/**
 * The page's CSS, nested under the page so it can't restyle anything around it, like the app around the preview.
 * A "<" could close the style element, and no CSS needs one, so they go
 */
export const pageCss = (css: string) => (css.trim() ? `.acta-page{${css.replace(/</g, "")}}` : "");

/** Keeps what a page says to what fits, and its links to ones that open somewhere */
export function fitPage(patch: Partial<PublicPage>): Partial<PublicPage> {
  const out = { ...patch };
  const text = (v: unknown, max = pageLimits.text) => (typeof v === "string" ? v : "").slice(0, max);
  const link = (l: PageLink): PageLink => ({ label: text(l.label, 40), url: text(l.url, pageLimits.url) });
  for (const k of ["title", "ideaOne", "ideaMany", "ideaPrompt", "announcement"] as const)
    if (typeof out[k] === "string") out[k] = text(out[k]);
  for (const k of ["tagline", "footer"] as const) if (typeof out[k] === "string") out[k] = text(out[k], pageLimits.long);
  if (out.css !== undefined) out.css = text(out.css, pageLimits.css);
  for (const k of ["headerHtml", "footerHtml"] as const) if (out[k] !== undefined) out[k] = text(out[k], pageLimits.html);
  if (typeof out.announcementLink === "string") out.announcementLink = text(out.announcementLink, pageLimits.url);
  if (out.cta) out.cta = link(typeof out.cta === "object" ? out.cta : { label: "", url: "" });
  if (out.links)
    out.links = (Array.isArray(out.links) ? out.links : [])
      .filter((l) => l && typeof l === "object")
      .slice(0, pageLimits.links)
      .map(link);
  if (out.color !== undefined && !(typeof out.color === "string" && /^#[0-9a-f]{6}$/i.test(out.color))) out.color = "";
  if (out.sections) {
    const known: PageSection[] = ["roadmap", "ideas", "shipped"];
    const kept = [...new Set((Array.isArray(out.sections) ? out.sections : []).filter((s) => known.includes(s)))];
    out.sections = [...kept, ...known.filter((s) => !kept.includes(s))];
  }
  if (out.shippedLimit !== undefined) out.shippedLimit = Math.max(0, Math.min(200, Math.round(out.shippedLimit) || 0));
  return out;
}

/** A link someone typed, made safe to open: web and mail addresses only */
export function safeHref(url: string) {
  const u = url.trim();
  if (!u) return null;
  if (/^mailto:[^\s]+@[^\s]+$/i.test(u)) return u;
  const withScheme = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export const pageFrom = (name: string, slug: string, page: object): PublicPage => {
  const stored = page as Partial<PublicPage>;
  return {
    ...defaultPage,
    title: name,
    ...fitPage({ ...stored, sections: stored.sections ?? defaultPage.sections }),
    slug,
    stageNames: { ...defaultPage.stageNames, ...(stored.stageNames ?? {}) },
    cta: { ...defaultPage.cta, ...fitPage({ cta: { ...defaultPage.cta, ...(stored.cta ?? {}) } }).cta },
  };
};

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
  { id: "canceled", title: "Canceled", rock: "Spoil" },
];

/** Done or canceled: nothing left to do */
export const closed = (status: StatusCategory) => status === "done" || status === "canceled";

/** Puts tasks away, or brings them back */
export const archiveTasks = (ids: string[], on: boolean): BoardAction => ({
  type: "bulk",
  ids,
  patch: { archived: on ? new Date().toISOString() : undefined },
  note: on ? "archived the task" : "brought the task back from the archive",
});

export const defaultStatusTitle: Record<StatusCategory, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  review: "In review",
  done: "Done",
  canceled: "Canceled",
};
// What the board calls each status. A board can give them names of its own (see setBoardMeta)
export const statusTitle: Record<StatusCategory, string> = { ...defaultStatusTitle };
export type StatusNames = Partial<Record<StatusCategory, string>>;

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
  boardId?: string;
  fields?: CustomField[];
  statusNames?: StatusNames;
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
export const customFields: CustomField[] = [];
export const me = {
  name: demoMeta.me,
  id: demoMeta.meId,
  workspace: demoMeta.workspace,
  team: demoMeta.team,
  prefix: demoMeta.prefix,
  live: demoMeta.live,
  board: undefined as string | undefined,
};

export function setBoardMeta(meta: BoardMeta) {
  me.name = meta.me;
  me.id = meta.meId;
  me.workspace = meta.workspace;
  me.team = meta.team;
  me.prefix = meta.prefix;
  me.live = meta.live;
  me.board = meta.boardId;
  people.splice(0, people.length, ...meta.people);
  labels.splice(0, labels.length, ...meta.labels);
  projects.splice(0, projects.length, ...meta.projects.map((p) => p.name));
  for (const key of Object.keys(projectTone)) delete projectTone[key];
  for (const p of meta.projects) projectTone[p.name] = p.tone;
  customFields.splice(0, customFields.length, ...(meta.fields ?? []));
  for (const s of statuses) {
    s.title = meta.statusNames?.[s.id]?.trim() || defaultStatusTitle[s.id];
    statusTitle[s.id] = s.title;
  }
}

/** What a task holds for one of the board's fields, read as its type expects */
export function customValue(task: Task, field: CustomField): CustomValue | undefined {
  const v = task.custom?.[field.id];
  if (v === undefined || v === null || v === "") return undefined;
  if (field.type === "multi") return Array.isArray(v) ? v.map(String) : [String(v)];
  if (field.type === "number") return typeof v === "number" ? v : Number.isFinite(Number(v)) ? Number(v) : undefined;
  return Array.isArray(v) ? v.join(", ") : String(v);
}

/** A field's value as text, for cells, copying and agents */
export function customText(task: Task, field: CustomField) {
  const v = customValue(task, field);
  return v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v);
}

/** Sets one field on a task, or clears it with undefined, leaving the task's other fields as they are */
export function withCustom(task: Task, field: string, value: CustomValue | undefined): Record<string, CustomValue> {
  const next = { ...(task.custom ?? {}) };
  if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) delete next[field];
  else next[field] = value;
  return next;
}

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

export const nextTaskId = (state: BoardState) => `${me.prefix}-${state.next}`;

export const personById = (id?: string) => people.find((p) => p.id === id);
export const labelTone = (id: string) => labels.find((l) => l.id === id)?.tone ?? "lapis";
export const updatedAt = (t: Task) => t.activity.at(-1)?.at ?? 0;
/** Who changed the task last, and through what, such as an agent */
export const updatedBy = (t: Task) => {
  const last = t.activity.at(-1);
  return last ? { who: last.who, via: last.via, person: people.find((p) => p.name === last.who) } : null;
};

export type Stage = "planned" | "progress" | "shipped";
// Canceled work never reaches the public roadmap, so it has no stage of its own
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
  const columns = emptyColumns();
  for (const t of seedTasks) columns[t.status].push(t.id);
  return {
    next: 65,
    tasks,
    columns,
    roadmap: { public: true, suggestions: structuredClone(seedSuggestions), page: structuredClone(defaultPage) },
  };
}

export const emptyColumns = (): BoardState["columns"] => ({
  backlog: [],
  todo: [],
  in_progress: [],
  review: [],
  done: [],
  canceled: [],
});

export function normalizeBoard(board: BoardState): BoardState {
  const page = board.roadmap?.page;
  return {
    ...board,
    // Boards saved before a status existed don't have its column
    columns: { ...emptyColumns(), ...board.columns },
    roadmap: {
      public: board.roadmap?.public ?? true,
      suggestions: board.roadmap?.suggestions ?? [],
      page: { ...defaultPage, ...page, stageNames: { ...defaultPage.stageNames, ...page?.stageNames } },
    },
  };
}

// What the database accepts. Edits are held to these as they're made, so a long paste can't stop a save
export const limits = {
  title: 500,
  project: 60,
  labels: 20,
  description: 20_000,
  subtask: 200,
  // The subtasks of one task, as JSON. The database allows 20,000 bytes and writes JSON a little longer
  subtaskBytes: 16_000,
  // A task's own field values, as JSON. The database allows 10,000 bytes
  customBytes: 9_000,
  comment: 10_000,
  idea: 200,
  ideaDetails: 2_000,
};

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/** Holds a change to a task to what the database accepts */
export function fitTask<T extends Partial<Task>>(patch: T): T {
  const out = { ...patch };
  if (typeof out.title === "string" && out.title.length > limits.title) out.title = out.title.slice(0, limits.title);
  if (out.project && out.project.length > limits.project) out.project = out.project.slice(0, limits.project);
  if (out.labels && (out.labels.length > limits.labels || new Set(out.labels).size < out.labels.length))
    out.labels = [...new Set(out.labels)].slice(0, limits.labels);
  if (typeof out.description === "string" && out.description.length > limits.description)
    out.description = out.description.slice(0, limits.description);
  if (out.subtasks) {
    let list = out.subtasks.map((s) =>
      s.title.length > limits.subtask ? { ...s, title: s.title.slice(0, limits.subtask) } : s,
    );
    while (list.length && bytes(list) > limits.subtaskBytes) list = list.slice(0, -1);
    if (list.length !== out.subtasks.length || list.some((s, i) => s !== out.subtasks![i])) out.subtasks = list;
  }
  if (out.custom && bytes(out.custom) > limits.customBytes) {
    const entries = Object.entries(out.custom);
    while (entries.length && bytes(Object.fromEntries(entries)) > limits.customBytes) entries.pop();
    out.custom = Object.fromEntries(entries);
  }
  return out;
}

export type BoardAction =
  | { type: "columns"; columns: BoardState["columns"] }
  // Puts a task in a column, before another task or at the end, changing whatever else the patch says on the way
  | {
      type: "move";
      id: string;
      to: StatusCategory;
      before: string | null;
      patch?: Partial<Task>;
      note?: string;
    }
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

function patchTask(state: BoardState, id: string, change: Partial<Task>, note?: string): BoardState {
  const prev = state.tasks[id];
  if (!prev) return state;
  const patch = fitTask(change);
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

    case "move": {
      const prev = state.tasks[action.id];
      if (!prev) return state;
      const patch: Partial<Task> = { ...action.patch };
      if (action.to !== prev.status) patch.status = action.to;
      const changed = (Object.keys(patch) as (keyof Task)[]).some(
        (k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(patch[k] ?? null),
      );
      const next = changed ? patchTask(state, action.id, patch, action.note) : state;
      const columns = { ...next.columns };
      for (const s of Object.keys(columns) as StatusCategory[])
        if (columns[s].includes(action.id)) columns[s] = columns[s].filter((x) => x !== action.id);
      const column = [...columns[action.to]];
      const at = action.before ? column.indexOf(action.before) : -1;
      column.splice(at < 0 ? column.length : at, 0, action.id);
      columns[action.to] = column;
      const before = state.columns[action.to];
      if (!changed && column.length === before.length && column.every((x, i) => x === before[i])) return state;
      return { ...next, columns };
    }

    case "bulk":
      return action.ids.reduce((s, id) => patchTask(s, id, action.patch, action.note), state);

    case "add": {
      const id = nextTaskId(state);
      const status = action.patch?.status ?? action.status;
      const task: Task = {
        id,
        title: action.title.slice(0, limits.title),
        priority: "none",
        labels: [],
        description: "",
        subtasks: [],
        comments: 0,
        activity: [{ id: newId(), at: Date.now(), who: me.name, text: action.note ?? "created the task" }],
        ...(state.roadmap.page.newTasksPublic ? { public: true } : {}),
        ...fitTask(action.patch ?? {}),
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
        fitTask({ ...task, subtasks: [...task.subtasks, { id: `s${Date.now()}`, title: action.title, done: false }] }),
        `added subtask “${action.title}”`,
      );
      return { ...state, tasks: { ...state.tasks, [task.id]: next } };
    }

    case "comment": {
      const task = state.tasks[action.id];
      const body = action.body.trim().slice(0, limits.comment);
      if (!task || !body) return state;
      const comment: Comment = { id: newId(), who: me.name, at: Date.now(), body };
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
      const title = action.title.trim().slice(0, limits.idea);
      if (!title) return state;
      const suggestion: Suggestion = {
        id: newId(),
        title,
        details: action.details?.trim().slice(0, limits.ideaDetails) || undefined,
        by: me.name,
        at: Date.now(),
        votes: 1,
        voted: true,
      };
      return { ...state, roadmap: { ...state.roadmap, suggestions: [suggestion, ...state.roadmap.suggestions] } };
    }

    case "page":
      return { ...state, roadmap: { ...state.roadmap, page: { ...state.roadmap.page, ...fitPage(action.patch) } } };

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
