import {
  boardState,
  FIRST,
  PAGE,
  THREAD_ACTIVITY,
  type BoardLine,
  type FirstRead,
  type NestedBoard,
  type NestedTask,
} from "@/lib/board-load";
import type { Place, Shelf, ShelfCounts } from "@/lib/board-shelves";
import { pageFrom, type BoardState, type Label, type PublicPage } from "@/lib/board-store";
import type { Wire } from "@/lib/board-save";
import { activityFrom, apply, commentFrom, heldBy, taskNumber, type Change, type TaskRow } from "@/lib/board-sync";
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
const closedStatus = (s: string) => s === "done" || s === "canceled";

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
  // Tasks written, one for each row a statement wrote, as the live feed sends one change for each
  writes: number[] = [];
  // Set to refuse some requests, as a check constraint or a dropped connection would
  refuse: ((changes: Wire) => Err | null) | null = null;
  private clock = Date.UTC(2026, 9, 27, 9);

  // The database's clock, which moves a second with each write
  now() {
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
    const written = this.writes.length;
    try {
      return { data: this.apply(changes), error: null };
    } catch (e) {
      // One failed part undoes the whole request, like a transaction
      this.writes.length = written;
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
      // As the tasks_stamp_closed trigger does: a task made closed closed when it was made
      row.closed_at = closedStatus(row.status) ? row.created_at : null;
      this.check(row);
      this.tasks.set(n, row);
      this.writes.push(n);
      this.board.next_number = Math.max(this.board.next_number, n + 1);
    }

    // A task that changes and moves is written once, with its new position
    const places = new Map(c.order.map((o) => [o.number, o.position]));
    for (const u of c.updated) {
      const row = this.tasks.get(num(u.number));
      if (!row) continue;
      const next = { ...row, ...(u.fields as Partial<Row>), position: places.get(u.number) ?? row.position };
      // Closing stamps the time, reopening clears it, and done to canceled keeps it
      if (!closedStatus(next.status)) next.closed_at = null;
      else if (!closedStatus(row.status)) next.closed_at = this.now();
      this.check(next);
      this.tasks.set(next.number, next);
      this.writes.push(next.number);
    }

    for (const n of c.deleted) {
      const row = this.tasks.get(n);
      if (row && !row.deleted_at) {
        row.deleted_at = this.now();
        this.writes.push(n);
      }
    }

    // Rows already where they're asked to be are left alone
    for (const o of c.order) {
      const row = this.tasks.get(num(o.number));
      if (row && row.position !== o.position) {
        row.position = o.position;
        this.writes.push(row.number);
      }
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

  /** Who wrote something, as the app names people */
  nameOf = (id: string | null) => (id === this.me ? "Me" : "Them");

  private lines(number: number) {
    return this.activity
      .filter((a) => a.number === number)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((a) => ({ id: a.id, actor: a.actor, text: a.text, created_at: a.created_at, via: null }));
  }

  /** Tasks not deleted, in board order */
  private live() {
    return [...this.tasks.values()]
      .filter((t) => !t.deleted_at)
      .sort((a, b) => a.position - b.position || a.number - b.number);
  }

  /** A task as a read of the board brings it, with its comment count, latest line and your vote */
  private nested(t: Row): NestedTask {
    return {
      ...t,
      vote_count: this.votes.filter((v) => v.number === t.number).length,
      comments: [{ count: this.comments.filter((c) => c.number === t.number).length }],
      activity: this.lines(t.number).slice(0, 1),
      task_votes: this.votes.filter((v) => v.number === t.number && v.voter === this.me).map((v) => ({ voter: v.voter })),
    };
  }

  private recent(): BoardLine[] {
    const live = this.live();
    return this.activity
      .filter((a) => a.actor !== this.me && live.some((t) => t.number === a.number))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 20)
      .map((a) => ({
        id: a.id,
        number: a.number,
        actor: a.actor,
        text: a.text,
        created_at: a.created_at,
        via: null,
        task: this.nested(live.find((t) => t.number === a.number)!),
      }));
  }

  /** What board_shelves counts */
  counts(): ShelfCounts {
    const out: ShelfCounts = {};
    for (const t of this.live()) {
      const s: Shelf = t.archived_at ? "archived" : t.status;
      const c = (out[s] ??= { count: 0, tail: null });
      c.count++;
      c.tail = Math.max(c.tail ?? -Infinity, t.position);
    }
    return out;
  }

  /** A page of a shelf in board order after a place on it, as readShelf reads it */
  page(shelf: Shelf, after?: Place, limit = PAGE): NestedTask[] {
    return this.live()
      .filter((t) => (shelf === "archived" ? Boolean(t.archived_at) : !t.archived_at && t.status === shelf))
      .filter((t) => !after || t.position > after.position || (t.position === after.position && t.number > after.number))
      .slice(0, limit)
      .map((t) => this.nested(t));
  }

  /** Tasks by number, as readTasks reads them */
  pick(numbers: number[]): NestedTask[] {
    return this.live()
      .filter((t) => numbers.includes(t.number))
      .map((t) => this.nested(t));
  }

  /** The board as a visit reads it now: the first page of each shelf the view shows, every shelf's count, and the
   * Inbox's lines with their tasks. counts: false is a database without the shelves migration */
  loadShelves(shelves: Shelf[], { limit = FIRST, counts = true }: { limit?: number; counts?: boolean } = {}) {
    const heads = shelves.map((s) => this.page(s, undefined, limit));
    const read: FirstRead["read"] = {};
    const through: FirstRead["through"] = {};
    shelves.forEach((s, i) => {
      read[s] = heads[i].length;
      const last = heads[i].at(-1);
      if (last) through[s] = { position: last.position, number: last.number };
    });
    const board: NestedBoard = { ...this.nestedBoard(), tasks: heads.flat() };
    const state = boardState(board, this.nameOf, this.recent(), {
      counts: counts ? this.counts() : null,
      read,
      through,
      limit,
    });
    return { ...state, roadmap: { ...state.roadmap, page: pageFrom(this.board.name, this.board.slug, this.board.page) } };
  }

  private nestedBoard(): Omit<NestedBoard, "tasks"> {
    return {
      id: this.board.id,
      slug: this.board.slug,
      name: this.board.name,
      prefix: this.prefix,
      next_number: this.board.next_number,
      labels: this.board.labels,
      projects: [],
      roadmap_public: this.board.roadmap_public,
      page: this.board.page,
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
  }

  /** The board as the app reads it on a fresh visit: each task's comment count and latest activity line, and the
   * board's latest lines by other people for the Inbox */
  load(): BoardState {
    const live = [...this.tasks.values()]
      .filter((t) => !t.deleted_at)
      .sort((a, b) => a.position - b.position || a.number - b.number);
    const recent: BoardLine[] = this.activity
      .filter((a) => a.actor !== this.me && live.some((t) => t.number === a.number))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 20)
      .map((a) => ({ id: a.id, number: a.number, actor: a.actor, text: a.text, created_at: a.created_at, via: null }));
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
        comments: [{ count: this.comments.filter((c) => c.number === t.number).length }],
        activity: this.lines(t.number).slice(0, 1),
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
    const state = boardState(nested, this.nameOf, recent);
    return { ...state, roadmap: { ...state.roadmap, page: pageFrom(this.board.name, this.board.slug, this.board.page) } };
  }

  /** A task's thread and newest activity, as its dialog reads them */
  read(number: number) {
    const lines = this.lines(number).slice(0, THREAD_ACTIVITY);
    return {
      comments: this.comments
        .filter((c) => c.number === number)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => commentFrom({ ...c, via: null }, this.nameOf)),
      activity: lines.map((a) => activityFrom(a, this.nameOf)).reverse(),
      complete: lines.length < THREAD_ACTIVITY,
    };
  }

  /** The change a task's dialog makes once its thread is read, with what base held when the read began */
  thread(id: string, base: BoardState): Change {
    return { kind: "thread", task: id, ...this.read(taskNumber(id)), had: heldBy(base.tasks[id]) };
  }

  /** A copy of the board with every task's thread read, as if each dialog had been opened. base is the copy the
   * server last confirmed, which state is built on */
  readAll(state: BoardState, base = state): BoardState {
    return Object.keys(state.tasks).reduce((s, id) => apply(s, this.thread(id, base)), state);
  }

  /** What the database holds, with every thread */
  loadWhole() {
    return this.readAll(this.load());
  }
}
