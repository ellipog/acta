import {
  pageFrom,
  type BoardMeta,
  type BoardState,
  type Project,
  type StatusCategory,
  type Suggestion,
  type Task,
} from "./board-store";
import type { DitherName } from "./dither-assets";
import { toneFor, type WorkspaceSummary } from "./live";

export const visitorCookie = "acta-visitor";

export type PublicTask = {
  number: number;
  title: string;
  status: StatusCategory;
  project: string | null;
  // These three are empty unless the page shows them, and missing before the closed times migration
  labels?: string[];
  opened?: string | null;
  closed?: string | null;
  start_on: string | null;
  due_on: string | null;
  shipped_on: string | null;
  description: string;
  subtasks: { id: string; done: boolean }[];
  votes: number;
  voted: boolean;
  assignee: { id: string; name: string; avatar: string | null } | null;
};

export type PublicSuggestion = {
  id: string;
  title: string;
  details: string | null;
  by: string;
  at: string;
  votes: number;
  voted: boolean;
};

export type PublicRoadmapData = {
  workspace: {
    name: string;
    slug: string;
    sigil: DitherName;
    tone: WorkspaceSummary["tone"];
    image?: string | null;
  };
  board: {
    id: string;
    name: string;
    slug: string;
    prefix: string;
    projects: Project[];
    page: object;
  };
  tasks: PublicTask[];
  suggestions: PublicSuggestion[];
};

export type PublicResult = PublicRoadmapData | { private: true; workspace: { name: string; slug: string } } | null;

export const isPrivate = (r: PublicResult): r is { private: true; workspace: { name: string; slug: string } } =>
  Boolean(r && "private" in r);

/** What one visitor voted for, with the latest counts for those, and ideas they sent in the last hour, from
 * public_votes. The page itself is cached and the same for everyone, so these come once it's open */
export type OwnVotes = {
  tasks: { number: number; votes: number }[];
  suggestions: { id: string; votes: number }[];
  mine: PublicSuggestion[];
};

/** The visitor's own votes, from a roadmap read as them, for when public_votes isn't there yet */
export const votesIn = (data: PublicRoadmapData): OwnVotes => ({
  tasks: data.tasks.filter((t) => t.voted).map((t) => ({ number: t.number, votes: t.votes })),
  suggestions: data.suggestions.filter((s) => s.voted).map((s) => ({ id: s.id, votes: s.votes })),
  mine: [],
});

const suggestionOf = (s: PublicSuggestion): Suggestion => ({
  id: s.id,
  title: s.title,
  details: s.details ?? undefined,
  by: s.by,
  at: Date.parse(s.at),
  votes: s.votes,
  voted: s.voted,
});

/** Marks what the visitor voted for on the shared page and adds their ideas it doesn't have yet. Anything they've
 * already voted on or sent since it opened, in `skip`, stays as they left it */
export function withOwnVotes(
  state: BoardState,
  own: OwnVotes,
  prefix: string,
  skip: ReadonlySet<string> = new Set(),
): BoardState {
  const tasks = { ...state.tasks };
  for (const v of own.tasks ?? []) {
    const id = `${prefix}-${v.number}`;
    if (tasks[id] && !skip.has(id)) tasks[id] = { ...tasks[id], votes: v.votes, voted: true };
  }
  const voted = new Map((own.suggestions ?? []).map((v) => [v.id, v.votes]));
  const listed = new Set(state.roadmap.suggestions.map((s) => s.id));
  const added = (own.mine ?? []).filter((s) => !listed.has(s.id) && !skip.has(s.id)).map(suggestionOf);
  const suggestions = state.roadmap.suggestions.map((s) =>
    voted.has(s.id) && !skip.has(s.id) ? { ...s, votes: voted.get(s.id)!, voted: true } : s,
  );
  return { ...state, tasks, roadmap: { ...state.roadmap, suggestions: [...added, ...suggestions] } };
}

const statusKeys: StatusCategory[] = ["backlog", "todo", "in_progress", "review", "done", "canceled"];

export function publicState(data: PublicRoadmapData): BoardState {
  const tasks: Record<string, Task> = {};
  const columns = Object.fromEntries(statusKeys.map((s) => [s, [] as string[]])) as BoardState["columns"];
  for (const t of data.tasks) {
    const id = `${data.board.prefix}-${t.number}`;
    tasks[id] = {
      id,
      title: t.title,
      status: t.status,
      priority: "none",
      project: t.project ?? undefined,
      labels: t.labels ?? [],
      start: t.start_on ?? undefined,
      due: t.due_on ?? undefined,
      assignee: t.assignee?.id,
      description: t.description,
      subtasks: t.subtasks.map((s) => ({
        id: String(s.id),
        title: "",
        done: s.done,
      })),
      comments: 0,
      activity: [],
      public: true,
      votes: t.votes,
      voted: t.voted,
      shipped: t.shipped_on ?? undefined,
      opened: t.opened ?? undefined,
      closed: t.closed ?? undefined,
    };
    columns[t.status].push(id);
  }
  return {
    next: 1,
    tasks,
    columns,
    roadmap: {
      public: true,
      page: pageFrom(data.board.name, data.board.slug, data.board.page),
      suggestions: data.suggestions.map(suggestionOf),
    },
  };
}

export function publicMeta(data: PublicRoadmapData): BoardMeta {
  const people = new Map(data.tasks.flatMap((t) => (t.assignee ? [[t.assignee.id, t.assignee] as const] : [])));
  return {
    me: "You",
    meId: "visitor",
    workspace: data.workspace.slug,
    team: data.workspace.name,
    prefix: data.board.prefix,
    live: false,
    labels: [],
    projects: data.board.projects ?? [],
    people: [...people.values()].map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      tone: toneFor(p.id),
    })),
  };
}
