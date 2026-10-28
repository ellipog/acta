import { boardState, type NestedBoard } from "@/lib/board-load";
import { pageFrom, type BoardState, type Label, type PublicPage } from "@/lib/board-store";
import type { Wire } from "@/lib/board-save";
import type { TaskRow } from "@/lib/board-sync";
import { can, type Permission, type Permissions, type Role } from "@/lib/live";

// A stand-in for the database behind apply_board_changes, close enough to catch a change that never reaches it.
// It keeps the same rows, numbers new tasks the same way, checks the same limits and rolls a whole request back
// when one part fails. Boards are read back through the app's own loader

type Err = { code?: string; message: string };
type Row = TaskRow & { created_at: string };
type CommentRow = { id: string; number: number; author: string; body: string; created_at: string };
type ActivityRow = { id: string; number: number; actor: string; text: string; created_at: string };
type IdeaRow = { id: string; title: string; details: string | null; by_name: string; created_at: string };

const statuses = ["backlog", "todo", "in_progress", "review", "done", "canceled"];

/** The permissions a request needs, as apply_board_changes checks them */
export function required(w: Partial<Wire>): Permission[] {
  const has = (k: keyof Wire) => Array.isArray(w[k]) && (w[k] as unknown[]).length > 0;
  const out = new Set<Permission>();
  if (has("created") || has("updated") || has("order") || has("unactivity")) out.add("edit");
  if (has("deleted")) out.add("delete");
  if (has("comments") || has("voted") || has("suggested") || has("suggestionVoted")) out.add("comment");
  if (has("activity")) {
    const commentsOnly = (w.activity ?? []).every((a) => a.text === "commented");
    out.add(commentsOnly ? "comment" : "edit");
  }
  if (w.board || has("declined")) out.add("roadmap");
  return [...out];
}
const fail = (code: string, message: string): never => {
  throw { code, message } satisfies Err;
};

export class FakeBoardServer {
  me = "11111111-1111-4111-8111-111111111111";
  prefix = "ACT";
  board = {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "web",
    name: "Web",
    next_number: 1,
    roadmap_public: false,
    page: {} as Partial<PublicPage>,
    labels: [] as Label[],
  };
  tasks = new Map<number, Row>();
  comments: CommentRow[] = [];
  activity: ActivityRow[] = [];
  votes: { number: number; voter: string }[] = [];
  ideas: IdeaRow[] = [];
  ideaVotes: { id: string; voter: string }[] = [];
  requests: Wire[] = [];
  // Set to refuse some requests, as a check constraint or a dropped connection would
  refuse: ((changes: Wire) => Err | null) | null = null;
  private clock = Date.UTC(2026, 9, 27, 9);

  private now() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  // Who is saving, as public.can sees them
  role: Role = "owner";
  permissions: Permissions = {};

  /** What the app's save function sends to */
  send = async (changes: Wire) => {
    this.requests.push(structuredClone(changes));
    const refused = this.refuse?.(changes);
    if (refused) return { data: null, error: refused };
    const missing = required(changes).find((p) => !can(this.role, this.permissions, p));
    if (missing) return { data: null, error: { code: "42501", message: `Needs ${missing}` } };
    const saved = structuredClone({
      board: this.board,
      tasks: [...this.tasks],
      comments: this.comments,
      activity: this.activity,
      votes: this.votes,
      ideas: this.ideas,
      ideaVotes: this.ideaVotes,
    });
    try {
      return { data: this.apply(changes), error: null };
    } catch (e) {
      // One failed part undoes the whole request, like a transaction
      this.board = saved.board;
      this.tasks = new Map(saved.tasks);
      this.comments = saved.comments;
      this.activity = saved.activity;
      this.votes = saved.votes;
      this.ideas = saved.ideas;
      this.ideaVotes = saved.ideaVotes;
      return { data: null, error: e as Err };
    }
  };

  private check(row: Row) {
    if (!statuses.includes(row.status)) fail("23514", "tasks_status_check");
    if (row.title.length > 500) fail("23514", "tasks_title_check");
    if (row.project && row.project.length > 60) fail("23514", "tasks_project_check");
    if (row.labels.length > 20) fail("23514", "tasks_labels_check");
    if (row.description.length > 20_000) fail("23514", "tasks_description_check");
    if (new TextEncoder().encode(JSON.stringify(row.subtasks)).length > 20_000) fail("23514", "tasks_subtasks_check");
  }

  private apply(c: Wire) {
    const moved: Record<string, number> = {};
    const num = (n: number) => moved[n] ?? n;

    for (const t of c.created as Record<string, unknown>[]) {
      let n = t.number as number;
      const existing = this.tasks.get(n);
      if (existing && !existing.deleted_at) {
        n = this.board.next_number++;
        moved[t.number as number] = n;
      }
      const row: Row = {
        board_id: this.board.id,
        number: n,
        title: t.title as string,
        status: t.status as Row["status"],
        priority: (t.priority as Row["priority"]) ?? "none",
        size: (t.size as Row["size"]) ?? null,
        project: (t.project as string) ?? null,
        labels: (t.labels as string[]) ?? [],
        start_on: (t.start_on as string) ?? null,
        due_on: (t.due_on as string) ?? null,
        assignee: (t.assignee as string) ?? null,
        description: (t.description as string) ?? "",
        subtasks: (t.subtasks as Row["subtasks"]) ?? [],
        public: Boolean(t.public),
        shipped_on: (t.shipped_on as string) ?? null,
        archived_at: (t.archived_at as string) ?? null,
        custom: (t.custom as Row["custom"]) ?? {},
        vote_count: 0,
        position: (t.position as number) ?? 0,
        origin: (t.origin as string) ?? null,
        deleted_at: null,
        created_at: this.now(),
      };
      this.check(row);
      this.tasks.set(n, row);
      this.board.next_number = Math.max(this.board.next_number, n + 1);
    }

    for (const u of c.updated) {
      const row = this.tasks.get(num(u.number));
      if (!row) continue;
      const next = { ...row, ...(u.fields as Partial<Row>) };
      this.check(next);
      this.tasks.set(next.number, next);
    }

    for (const n of c.deleted) {
      const row = this.tasks.get(n);
      if (row && !row.deleted_at) row.deleted_at = this.now();
    }

    for (const o of c.order) {
      const row = this.tasks.get(num(o.number));
      if (row) row.position = o.position;
    }

    for (const n of c.voted) {
      const number = num(n);
      if (!this.votes.some((v) => v.number === number && v.voter === this.me))
        this.votes.push({ number, voter: this.me });
    }
    this.votes = this.votes.filter((v) => !(v.voter === this.me && c.unvoted.includes(v.number)));

    for (const cm of c.comments) {
      if (!cm.body || cm.body.length > 10_000) fail("23514", "comments_body_check");
      if (!this.comments.some((x) => x.id === cm.id))
        this.comments.push({ id: cm.id!, number: num(cm.number), author: this.me, body: cm.body, created_at: this.now() });
    }
    this.comments = this.comments.filter((x) => !c.uncomments.includes(x.id));

    for (const a of c.activity) {
      if (!this.activity.some((x) => x.id === a.id))
        this.activity.push({
          id: a.id!,
          number: num(a.number),
          actor: this.me,
          text: a.text.slice(0, 300),
          created_at: this.now(),
        });
    }
    this.activity = this.activity.filter((x) => !c.unactivity.includes(x.id));

    if ("board" in c && c.board) {
      const b = c.board as { roadmap_public?: boolean; page?: object };
      if (b.roadmap_public !== undefined) this.board.roadmap_public = b.roadmap_public;
      if (b.page) {
        if (new TextEncoder().encode(JSON.stringify(b.page)).length > 16_000) fail("23514", "boards_page_check");
        this.board.page = structuredClone(b.page);
      }
    }

    for (const s of c.suggested) {
      if (!this.ideas.some((x) => x.id === s.id))
        this.ideas.push({ id: s.id, title: s.title, details: s.details, by_name: "Me", created_at: this.now() });
    }
    for (const id of c.suggestionVoted)
      if (!this.ideaVotes.some((v) => v.id === id && v.voter === this.me)) this.ideaVotes.push({ id, voter: this.me });
    this.ideaVotes = this.ideaVotes.filter((v) => !(v.voter === this.me && c.suggestionUnvoted.includes(v.id)));
    this.ideas = this.ideas.filter((x) => !c.declined.includes(x.id));

    return { moved, next: this.board.next_number };
  }

  /** The board as the app reads it on a fresh visit */
  load(): BoardState {
    const live = [...this.tasks.values()]
      .filter((t) => !t.deleted_at)
      .sort((a, b) => a.position - b.position || a.number - b.number);
    const nested: NestedBoard = {
      id: this.board.id,
      slug: this.board.slug,
      name: this.board.name,
      prefix: this.prefix,
      next_number: this.board.next_number,
      labels: this.board.labels,
      projects: [],
      roadmap_public: this.board.roadmap_public,
      page: this.board.page,
      tasks: live.map((t) => ({
        ...t,
        vote_count: this.votes.filter((v) => v.number === t.number).length,
        comments: this.comments
          .filter((c) => c.number === t.number)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((c) => ({ id: c.id, author: c.author, body: c.body, created_at: c.created_at, via: null })),
        activity: this.activity
          .filter((a) => a.number === t.number)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((a) => ({ id: a.id, actor: a.actor, text: a.text, created_at: a.created_at, via: null })),
        task_votes: this.votes.filter((v) => v.number === t.number && v.voter === this.me).map((v) => ({ voter: v.voter })),
      })),
      suggestions: this.ideas.map((s) => ({
        id: s.id,
        board_id: this.board.id,
        title: s.title,
        details: s.details,
        by_name: s.by_name,
        created_at: s.created_at,
        vote_count: this.ideaVotes.filter((v) => v.id === s.id).length,
        suggestion_votes: this.ideaVotes.filter((v) => v.id === s.id && v.voter === this.me).map((v) => ({ voter: v.voter })),
      })),
    };
    const state = boardState(nested, () => "Me");
    return { ...state, roadmap: { ...state.roadmap, page: pageFrom(this.board.name, this.board.slug, this.board.page) } };
  }
}
