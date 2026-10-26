import { pageFrom, type BoardMeta, type BoardState, type Project, type StatusCategory, type Task } from "./board-store";
import type { DitherName } from "./dither-assets";
import { toneFor, type WorkspaceSummary } from "./live";

export const visitorCookie = "acta-visitor";

export type PublicTask = {
  number: number;
  title: string;
  status: StatusCategory;
  project: string | null;
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

const statusKeys: StatusCategory[] = ["backlog", "todo", "in_progress", "review", "done"];

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
      labels: [],
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
      suggestions: data.suggestions.map((s) => ({
        id: s.id,
        title: s.title,
        details: s.details ?? undefined,
        by: s.by,
        at: Date.parse(s.at),
        votes: s.votes,
        voted: s.voted,
      })),
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
