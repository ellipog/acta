import { pageFrom, type PublicPage, type Stage, type StatusCategory } from "./board-store";
import { duration, timeToClose } from "./dates";
import type { PublicRoadmapData, PublicSuggestion, PublicTask } from "./public-roadmap";

// A published roadmap as JSON, for the keyless feed at /api/public and the roadmap API at /api/roadmap/v1. Both
// hold only what the public page shows: what a setting hides there stays out of here too

export const roadmapKeyShape = /^acta_pk_[A-Za-z0-9_-]{24,64}$/;
const visitorShape = /^[A-Za-z0-9-]{8,64}$/;
const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: string) => uuidShape.test(v);

/** Whether a site's own id for one of its visitors is one the API takes */
export const isVisitor = (v: unknown): v is string => typeof v === "string" && visitorShape.test(v);

export const stageFor = (status: StatusCategory): Stage =>
  status === "done" ? "shipped" : status === "todo" || status === "backlog" ? "planned" : "progress";

export const roadmapPage = (data: PublicRoadmapData) => pageFrom(data.board.name, data.board.slug, data.board.page);

/** The number in "ACT-12" or "12", if it's this board's */
export function taskNumber(ref: string, prefix: string) {
  const m = ref.trim().match(/^(?:([A-Za-z][A-Za-z0-9]*)-)?(\d{1,9})$/);
  if (!m || (m[1] && m[1].toUpperCase() !== prefix.toUpperCase())) return null;
  return Number(m[2]);
}

export function taskJson(data: PublicRoadmapData, page: PublicPage, t: PublicTask, opts: { visitor?: boolean } = {}) {
  const stage = stageFor(t.status);
  const took = stage === "shipped" ? timeToClose(t) : null;
  return {
    id: `${data.board.prefix}-${t.number}`,
    number: t.number,
    title: t.title,
    description: t.description,
    status: t.status,
    stage,
    stage_name: page.stageNames[stage],
    project: page.showProjects ? t.project : null,
    labels: t.labels ?? [],
    start: t.start_on,
    due: page.showDates ? t.due_on : null,
    shipped: t.shipped_on,
    // When it was made and when it closed, on pages that show how long work took
    opened: t.opened ?? null,
    closed: t.closed ?? null,
    time_to_close: took === null ? null : { seconds: Math.round(took / 1000), text: duration(took) },
    subtasks: page.showProgress
      ? { done: t.subtasks.filter((s) => s.done).length, total: t.subtasks.length }
      : null,
    votes: page.voting ? t.votes : null,
    ...(opts.visitor ? { voted: page.voting ? t.voted : null } : {}),
    assignee: t.assignee ? { name: t.assignee.name, avatar: t.assignee.avatar } : null,
  };
}

export type TaskJson = ReturnType<typeof taskJson>;

export function ideaJson(page: PublicPage, s: PublicSuggestion, opts: { visitor?: boolean } = {}) {
  return {
    id: s.id,
    title: s.title,
    details: s.details,
    by: s.by,
    at: s.at,
    votes: page.voting ? s.votes : null,
    ...(opts.visitor ? { voted: page.voting ? s.voted : null } : {}),
  };
}

/** What the page shows of its tasks: none that are canceled, and shipped ones only where the page lists them */
export const shownTasks = (data: PublicRoadmapData, page: PublicPage) =>
  data.tasks.filter((t) => t.status !== "canceled" && (page.showShipped || stageFor(t.status) !== "shipped"));

export type TaskQuery = {
  stage?: Stage[];
  project?: string;
  label?: string;
  q?: string;
  sort?: "position" | "votes" | "newest" | "shipped" | "due";
  limit?: number;
  offset?: number;
};

const stages: Stage[] = ["planned", "progress", "shipped"];
const sorts = ["position", "votes", "newest", "shipped", "due"] as const;

/** Reads a list request's query string. Anything it doesn't know is a problem to report, not to guess at */
export function readTaskQuery(params: URLSearchParams): TaskQuery | string {
  const out: TaskQuery = {};
  const stage = params.getAll("stage").flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
  if (stage.length) {
    const bad = stage.find((s) => !stages.includes(s as Stage));
    if (bad) return `stage must be planned, progress or shipped, not “${bad}”.`;
    out.stage = stage as Stage[];
  }
  for (const k of ["project", "label", "q"] as const) {
    const v = params.get(k)?.trim();
    if (v) out[k] = v.slice(0, 200);
  }
  const sort = params.get("sort");
  if (sort) {
    if (!sorts.includes(sort as (typeof sorts)[number])) return `sort must be one of ${sorts.join(", ")}.`;
    out.sort = sort as TaskQuery["sort"];
  }
  for (const [k, max] of [
    ["limit", 200],
    ["offset", 100_000],
  ] as const) {
    const v = params.get(k);
    if (v === null) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < (k === "limit" ? 1 : 0) || n > max)
      return `${k} must be a whole number from ${k === "limit" ? 1 : 0} to ${max}.`;
    out[k] = n;
  }
  return out;
}

export function queryTasks(list: TaskJson[], q: TaskQuery) {
  const text = q.q?.toLowerCase();
  const kept = list.filter(
    (t) =>
      (!q.stage || q.stage.includes(t.stage)) &&
      (!q.project || t.project?.toLowerCase() === q.project.toLowerCase()) &&
      (!q.label || t.labels.some((l) => l.toLowerCase() === q.label!.toLowerCase())) &&
      (!text || t.title.toLowerCase().includes(text) || t.description.toLowerCase().includes(text)),
  );
  // Numbers go up as tasks are made. Imports can bring older work in later, so where the page shows each task's
  // time, that comes first
  const timed = kept.every((t) => t.opened);
  const by: Record<NonNullable<TaskQuery["sort"]>, ((t: TaskJson) => number) | null> = {
    position: null,
    votes: (t) => -(t.votes ?? 0),
    newest: (t) => (timed ? -Date.parse(t.opened!) : -t.number),
    shipped: (t) => (t.shipped ? -Date.parse(t.shipped) : Infinity),
    due: (t) => (t.due ? Date.parse(t.due) : Infinity),
  };
  const key = by[q.sort ?? "position"];
  // The page's own order breaks ties, so a sort is the same every time
  const sorted = key
    ? kept
        .map((t, i) => ({ t, i, k: key(t) }))
        .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i))
        .map((x) => x.t)
    : kept;
  const offset = q.offset ?? 0;
  return { total: sorted.length, tasks: sorted.slice(offset, offset + (q.limit ?? 100)) };
}

/** The CORS headers for a key. With no sites set, any may call it; with some, only those, and calls from servers */
export function roadmapCors(origins: string[], origin: string | null) {
  const allowed = !origins.length || !origin || origins.includes(origin.toLowerCase());
  return {
    allowed,
    headers: {
      ...(allowed ? { "Access-Control-Allow-Origin": origins.length && origin ? origin : "*" } : {}),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Acta-Key",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    } as Record<string, string>,
  };
}

/** A site as an origin, from whatever was typed: "https://yourco.com/roadmap" becomes "https://yourco.com" */
export function originOf(value: string) {
  const v = value.trim();
  if (!v) return null;
  try {
    const origin = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`).origin.toLowerCase();
    // As the database checks it
    return /^https?:\/\/[a-z0-9.-]+(:[0-9]{1,5})?$/.test(origin) ? origin : null;
  } catch {
    return null;
  }
}
