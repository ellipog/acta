import { slugify } from "@/lib/slugs";
import type { StatusCategory } from "@/lib/board-store";

// How GitHub's branches, pull requests, commits and issues find their tasks and move them along. Kept apart from
// the webhook so it can be tested without GitHub

/** What a linked repository does, set per repository in the workspace's settings */
export type RepoSettings = {
  // Which steps move tasks by themselves
  automation: { start: boolean; review: boolean; done: boolean };
  // A comment on each pull request linking back to its tasks
  comment: boolean;
  // Bring the repository's issues onto the board and keep them in step
  issues: boolean;
  // Only issues with this label, so a busy repository doesn't flood the board
  issueLabel?: string;
};

export const defaultRepoSettings: RepoSettings = {
  automation: { start: true, review: true, done: true },
  comment: true,
  issues: false,
};

export function repoSettings(raw: unknown): RepoSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<RepoSettings>;
  const a = (s.automation ?? {}) as Partial<RepoSettings["automation"]>;
  return {
    automation: {
      start: a.start ?? defaultRepoSettings.automation.start,
      review: a.review ?? defaultRepoSettings.automation.review,
      done: a.done ?? defaultRepoSettings.automation.done,
    },
    comment: s.comment ?? defaultRepoSettings.comment,
    issues: s.issues ?? defaultRepoSettings.issues,
    issueLabel: typeof s.issueLabel === "string" && s.issueLabel.trim() ? s.issueLabel.trim().slice(0, 50) : undefined,
  };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The task numbers a piece of text mentions, like ACT-12 or act-12, for a board with that prefix */
export function taskNumbers(text: string | null | undefined, prefix: string): number[] {
  if (!text) return [];
  const found = new Set<number>();
  for (const m of text.matchAll(new RegExp(`(?<![A-Za-z0-9])${escape(prefix)}-(\\d{1,7})(?![A-Za-z0-9])`, "gi")))
    found.add(Number(m[1]));
  return [...found];
}

const closing = "close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved";

/** The tasks a pull request says it finishes, as in "Fixes ACT-12" or "Closes ACT-3, ACT-4" */
export function closingNumbers(text: string | null | undefined, prefix: string): number[] {
  if (!text) return [];
  const id = `${escape(prefix)}-\\d{1,7}`;
  const found = new Set<number>();
  const list = new RegExp(`\\b(?:${closing})\\b:?\\s+(${id}(?:\\s*(?:,|and)\\s*${id})*)`, "gi");
  for (const m of text.matchAll(list)) for (const n of taskNumbers(m[1], prefix)) found.add(n);
  return [...found];
}

/** A branch name for a task, like act-12-add-csv-export */
export function branchName(id: string, title: string) {
  const words = slugify(title).replace(/-+$/, "").slice(0, 40).replace(/-+$/, "");
  return words ? `${id.toLowerCase()}-${words}` : id.toLowerCase();
}

// How far along each status is. Automation only ever moves a task further
const rank: Record<StatusCategory, number> = { backlog: 0, todo: 1, in_progress: 2, review: 3, done: 4, canceled: 4 };

export type DevEvent =
  // A branch or commit names the task, or a draft pull request opens
  | "started"
  // A pull request is open and ready for review
  | "ready"
  // A pull request that finishes the task merged
  | "merged";

const target: Record<DevEvent, StatusCategory> = { started: "in_progress", ready: "review", merged: "done" };
const step: Record<DevEvent, keyof RepoSettings["automation"]> = { started: "start", ready: "review", merged: "done" };

/** Where a task should go after something happened on GitHub, or null to leave it where it is */
export function nextStatus(current: StatusCategory, event: DevEvent, settings: RepoSettings): StatusCategory | null {
  if (!settings.automation[step[event]]) return null;
  const to = target[event];
  return rank[to] > rank[current] ? to : null;
}

/** A pull request's state, as the task shows it */
export function prState(pr: { state: string; draft?: boolean; merged?: boolean; merged_at?: string | null }) {
  if (pr.merged || pr.merged_at) return "merged";
  if (pr.state === "closed") return "closed";
  return pr.draft ? "draft" : "open";
}

/** Where an issue's task belongs after it closes or reopens */
export function issueStatus(issue: { state: string; state_reason?: string | null }): StatusCategory {
  if (issue.state !== "closed") return "todo";
  return issue.state_reason === "not_planned" || issue.state_reason === "duplicate" ? "canceled" : "done";
}

/** Board labels for an issue's labels, matched by name, ignoring ones the board doesn't have */
export function boardLabels(issueLabels: (string | { name?: string })[], board: string[]) {
  const names = issueLabels.map((l) => (typeof l === "string" ? l : (l.name ?? "")).toLowerCase());
  return board.filter((b) => names.includes(b.toLowerCase()));
}

// Both sides can change an issue's title, status and labels. Each field remembers when each side last changed it,
// and the later change wins, so an edit on one side never undoes a newer one on the other
export type FieldTimes = { github?: Record<string, string>; acta?: Record<string, string> };

export function newer(times: FieldTimes, field: string, side: "github" | "acta", at: string) {
  const other = side === "github" ? times.acta?.[field] : times.github?.[field];
  return !other || Date.parse(at) >= Date.parse(other);
}

export function stamp(times: FieldTimes, field: string, side: "github" | "acta", at: string): FieldTimes {
  return { ...times, [side]: { ...times[side], [field]: at } };
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The board a repository most likely belongs to, by name: the same name, or the board's name as one part of the
 * repository's, like calcite-app for Calcite */
export function boardForRepo<B extends { id: string; name: string; slug: string }>(fullName: string, boards: B[]) {
  const repo = fullName.split("/").pop() ?? fullName;
  const whole = squash(repo);
  const parts = repo.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const names = (b: B) => [squash(b.name), squash(b.slug)].filter(Boolean);
  return (
    boards.find((b) => names(b).includes(whole)) ??
    boards.find((b) => names(b).some((n) => n.length >= 3 && parts.includes(n)))
  );
}
