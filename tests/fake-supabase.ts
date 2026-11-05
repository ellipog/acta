// A stand-in for Supabase behind the agent API: the PostgREST queries acta.ts and keys.ts make, agent_apply and
// agent_task_counts, over tables kept in memory. Every query and rpc is one round trip, recorded in calls, and rounds counts how many
// of them had to wait for one before, which is what a request's time on the network comes down to

type Row = Record<string, unknown>;
type Err = { code?: string; message: string };
type Result = { data: unknown; error: Err | null; count?: number | null };

// The embeds the agent API asks for, as PostgREST resolves them from foreign keys. many is a list of the rows
// pointing back, like a task's links
type Relation = { table: string; local: string[]; foreign: string[]; many?: boolean };
const relations: Record<string, Record<string, Relation>> = {
  members: {
    workspaces: { table: "workspaces", local: ["workspace_id"], foreign: ["id"] },
    profiles: { table: "profiles", local: ["user_id"], foreign: ["id"] },
  },
  boards: {
    workspaces: { table: "workspaces", local: ["workspace_id"], foreign: ["id"] },
  },
  activity: {
    tasks: { table: "tasks", local: ["board_id", "number"], foreign: ["board_id", "number"] },
  },
  tasks: {
    task_links: { table: "task_links", local: ["board_id", "number"], foreign: ["board_id", "number"], many: true },
  },
};

type Order = { column: string; ascending: boolean };

function sorted(rows: Row[], orders: Order[]) {
  return [...rows].sort((a, b) => {
    for (const { column, ascending } of orders) {
      const x = a[column] ?? null;
      const y = b[column] ?? null;
      if (x === y) continue;
      // Postgres puts nulls last going up and first going down
      if (x === null) return ascending ? 1 : -1;
      if (y === null) return ascending ? -1 : 1;
      return ((x as number | string) < (y as number | string) ? -1 : 1) * (ascending ? 1 : -1);
    }
    return 0;
  });
}

const timestamps = ["created_at", "updated_at", "deleted_at", "archived_at", "closed_at", "used_at"];
const statuses = ["backlog", "todo", "in_progress", "review", "done", "canceled"];
const closed = (s: unknown) => s === "done" || s === "canceled";

/** A time as PostgREST prints a timestamptz when the database runs in UTC */
export function pgTime(value: string) {
  const [whole, ms] = new Date(value).toISOString().slice(0, -1).split(".");
  const fraction = ms.replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}+00:00`;
}

function stored(values: Row) {
  const out = structuredClone(values);
  for (const k of timestamps) if (typeof out[k] === "string") out[k] = pgTime(out[k] as string);
  return out;
}

// Splits a select list at its top-level commas, leaving embeds whole
function parts(select: string) {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of select) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && !depth) {
      out.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

const fail = (code: string, message: string): never => {
  throw { code, message } satisfies Err;
};

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  /** One entry per round trip, like "select tasks" or "rpc agent_apply" */
  calls: string[] = [];
  /** The changes each agent_apply was sent */
  applied: Record<string, unknown>[] = [];
  rounds = 0;
  private round: Promise<void> | null = null;
  /** Set to make agent_apply fail, as a check constraint would */
  refuse: ((changes: Record<string, unknown>) => Err | null) | null = null;
  /** Set to stand for a database that hasn't had the latest migration: no agent_task_counts, and an agent_apply
   * that doesn't check tasks are there */
  behind = false;
  private clock = Date.UTC(2026, 10, 1, 9);

  now() {
    this.clock += 1000;
    return pgTime(new Date(this.clock).toISOString());
  }

  rows(table: string) {
    return (this.tables[table] ??= []);
  }

  // Round trips sent while others are still out share their round, so rounds counts the ones that wait on each other
  async trip(what: string) {
    this.calls.push(what);
    if (!this.round) {
      this.rounds++;
      this.round = new Promise((resolve) =>
        setImmediate(() => {
          this.round = null;
          resolve();
        }),
      );
    }
    await this.round;
  }

  from(table: string) {
    return new Query(this, table);
  }

  rpc(name: string, args: Record<string, unknown>) {
    return this.trip(`rpc ${name}`).then(() => this.call(name, args));
  }

  private call(name: string, args: Record<string, unknown>): Result {
    const missing = { data: null, error: { code: "PGRST202", message: `Could not find the function public.${name}` } };
    if (name === "agent_task_counts") return this.behind ? missing : { data: this.counts(args.p_boards as string[]), error: null };
    if (name === "agent_edit_comment") {
      const c = this.rows("comments").find((x) => x.id === args.p_comment);
      if (!c) return { data: null, error: { code: "P0002", message: "No such comment" } };
      const key = this.rows("agent_keys").find((k) => k.hash === args.p_key);
      if (!key) return { data: null, error: { code: "28000", message: "This key doesn’t work any more" } };
      if (c.agent_key !== key.id) return { data: null, error: { code: "42501", message: "A key can only edit comments it wrote" } };
      c.body = args.p_body;
      return { data: null, error: null };
    }
    if (name !== "agent_apply" || (this.behind && "p_live" in args)) return missing;
    const changes = args.p_changes as Record<string, unknown>;
    this.applied.push(structuredClone(changes));
    const refused = this.refuse?.(changes);
    if (refused) return { data: null, error: refused };
    // The tasks the change has to find there and not deleted
    for (const n of (args.p_live ?? []) as number[]) {
      const t = this.rows("tasks").find((x) => x.board_id === args.p_board && x.number === n);
      if (!t || t.deleted_at) return { data: null, error: { code: "P0002", message: "No such task" } };
    }
    const saved = structuredClone(this.tables);
    try {
      return { data: this.apply(args.p_board as string, changes), error: null };
    } catch (e) {
      // One failed part undoes the whole call, like the transaction it runs in
      this.tables = saved;
      return { data: null, error: e as Err };
    }
  }

  // What agent_task_counts answers: tasks that aren't deleted, by board, status and whether they're archived
  private counts(boards: string[]) {
    const out = new Map<string, { board_id: string; status: string; archived: boolean; tasks: number }>();
    for (const t of this.rows("tasks")) {
      if (!boards.includes(t.board_id as string) || t.deleted_at) continue;
      const archived = Boolean(t.archived_at);
      const key = `${t.board_id} ${t.status} ${archived}`;
      const hit = out.get(key) ?? { board_id: t.board_id as string, status: t.status as string, archived, tasks: 0 };
      hit.tasks++;
      out.set(key, hit);
    }
    return [...out.values()];
  }

  private check(row: Row) {
    if (!statuses.includes(row.status as string)) fail("23514", 'new row for relation "tasks" violates check constraint "tasks_status_check"');
    if ((row.title as string).length > 500) fail("23514", 'new row for relation "tasks" violates check constraint "tasks_title_check"');
    if ((row.labels as string[]).length > 20) fail("23514", 'new row for relation "tasks" violates check constraint "tasks_labels_check"');
  }

  // What apply_board_changes does with the parts the agent API sends
  private apply(boardId: string, c: Record<string, unknown>) {
    const board = this.rows("boards").find((b) => b.id === boardId);
    if (!board) fail("P0002", "No such board");
    const tasks = this.rows("tasks");
    const moved: Record<string, number> = {};
    const num = (n: number) => moved[n] ?? n;
    const find = (n: number) => tasks.find((t) => t.board_id === boardId && t.number === n);
    const list = (k: string) => (c[k] ?? []) as Row[];

    for (const t of list("created")) {
      let n = t.number as number;
      const existing = find(n);
      if (existing?.deleted_at) {
        Object.assign(existing, stored({ ...t, deleted_at: null, updated_at: this.now() }));
        this.check(existing);
        continue;
      }
      if (existing) {
        n = board!.next_number as number;
        moved[t.number as number] = n;
      }
      const at = this.now();
      const row: Row = stored({
        board_id: boardId,
        priority: "none",
        size: null,
        project: null,
        labels: [],
        start_on: null,
        due_on: null,
        assignee: null,
        description: "",
        subtasks: [],
        public: false,
        shipped_on: null,
        archived_at: null,
        custom: {},
        origin: null,
        position: 0,
        ...t,
        number: n,
        vote_count: 0,
        deleted_at: null,
        created_at: (t.created_at as string | undefined) ?? at,
        updated_at: at,
      });
      row.closed_at = closed(row.status) ? ((t.closed_at as string | undefined) ?? row.created_at) : null;
      this.check(row);
      tasks.push(row);
      board!.next_number = Math.max(board!.next_number as number, n + 1);
    }

    for (const u of list("updated")) {
      const row = find(num(u.number as number));
      if (!row) continue;
      const next: Row = { ...row, ...stored(u.fields as Row), updated_at: this.now() };
      if (!closed(next.status)) next.closed_at = null;
      else if (!closed(row.status)) next.closed_at = this.now();
      this.check(next);
      Object.assign(row, next);
    }

    for (const n of (c.deleted ?? []) as number[]) {
      const row = find(n);
      if (row && !row.deleted_at) row.deleted_at = this.now();
    }

    for (const o of list("order")) {
      const row = find(num(o.number as number));
      if (row) row.position = o.position;
    }

    for (const cm of list("comments"))
      this.rows("comments").push(
        stored({ board_id: boardId, author: "agent-user", via: "agent", ...cm, number: num(cm.number as number), created_at: cm.created_at ?? this.now() }),
      );
    for (const a of list("activity"))
      this.rows("activity").push(
        stored({ board_id: boardId, actor: "agent-user", via: "agent", ...a, number: num(a.number as number), created_at: a.created_at ?? this.now() }),
      );

    return { moved, next: board!.next_number };
  }
}

/** The one fake every test file hands the agent API. Test files share their modules, and the agent API keeps the
 * first client it's given, so they all have to give it the same one */
export const fakeSupabase = new FakeSupabase();

class Query {
  private filters: ((r: Row) => boolean)[] = [];
  // Filters and orders on an embed, by its name, as "workspaces.slug" and referencedTable name them
  private nested: Record<string, ((r: Row) => boolean)[]> = {};
  private orders: Order[] = [];
  private nestedOrders: Record<string, Order[]> = {};
  private max: number | undefined;
  private mode: "select" | "update" | "delete" = "select";
  private columns = "*";
  private counted = false;
  private head = false;
  private one = false;
  private values: Row = {};

  constructor(
    private db: FakeSupabase,
    private table: string,
  ) {}

  select(columns = "*", options?: { count?: string; head?: boolean }) {
    if (this.mode === "select") {
      this.columns = columns;
      this.counted = Boolean(options?.count);
      this.head = Boolean(options?.head);
    }
    return this;
  }
  update(values: Row) {
    this.mode = "update";
    this.values = values;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  private where(column: string, test: (value: unknown) => boolean) {
    const [embed, inner] = column.split(".");
    if (inner) (this.nested[embed] ??= []).push((r) => test(r[inner]));
    else this.filters.push((r) => test(r[column]));
    return this;
  }
  eq(column: string, value: unknown) {
    return this.where(column, (v) => v === value);
  }
  neq(column: string, value: unknown) {
    return this.where(column, (v) => v !== value);
  }
  gt(column: string, value: string | number) {
    return this.where(column, (v) => v !== null && v !== undefined && (v as string | number) > value);
  }
  is(column: string, value: null) {
    return this.where(column, (v) => (v ?? null) === value);
  }
  in(column: string, values: unknown[]) {
    return this.where(column, (v) => values.includes(v));
  }
  not(column: string, op: string, value: unknown) {
    if (op !== "is") throw new Error(`The fake can’t do not.${op}`);
    return this.where(column, (v) => (v ?? null) !== value);
  }
  contains(column: string, values: unknown[]) {
    return this.where(column, (v) => values.every((x) => ((v ?? []) as unknown[]).includes(x)));
  }
  overlaps(column: string, values: unknown[]) {
    return this.where(column, (v) => values.some((x) => ((v ?? []) as unknown[]).includes(x)));
  }
  or(): this {
    throw new Error("The fake can’t do or filters");
  }
  order(column: string, options?: { ascending?: boolean; referencedTable?: string }) {
    const o = { column, ascending: options?.ascending !== false };
    if (options?.referencedTable) (this.nestedOrders[options.referencedTable] ??= []).push(o);
    else this.orders.push(o);
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.one = true;
    return this;
  }

  then<A = Result, B = never>(resolve?: (r: Result) => A | PromiseLike<A>, reject?: (e: unknown) => B | PromiseLike<B>) {
    return this.db
      .trip(`${this.mode} ${this.table}`)
      .then(() => this.result())
      .then(resolve, reject);
  }

  private result(): Result {
    const all = this.db.rows(this.table);
    let hits = all.filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === "update") {
      for (const r of hits) Object.assign(r, stored(this.values));
      return { data: null, error: null };
    }
    if (this.mode === "delete") {
      this.db.tables[this.table] = all.filter((r) => !hits.includes(r));
      return { data: null, error: null };
    }
    // An inner embed keeps only the rows it finds something for
    for (const part of parts(this.columns)) {
      const inner = part.match(/^(\w+)!inner\s*\(/);
      if (inner) hits = hits.filter((r) => this.related(this.table, r, inner[1], true).found.length > 0);
    }
    hits = sorted(hits, this.orders);
    const count = hits.length;
    if (this.max !== undefined) hits = hits.slice(0, this.max);
    if (this.head) return { data: null, error: null, count };
    const data = hits.map((r) => this.pick(this.table, r, this.columns, true));
    if (this.one) {
      if (data.length > 1) return { data: null, error: { code: "PGRST116", message: "More than one row" } };
      return { data: data[0] ?? null, error: null };
    }
    return { data, error: null, count: this.counted ? count : null };
  }

  // The rows an embed brings along. The query's own filters and order on it apply at its top level
  private related(table: string, row: Row, name: string, top: boolean) {
    const rel = relations[table]?.[name];
    if (!rel) throw new Error(`The fake doesn’t know ${table}.${name}`);
    let found = this.db.rows(rel.table).filter((r) => rel.foreign.every((f, i) => r[f] === row[rel.local[i]]));
    if (top) found = sorted(found.filter((r) => (this.nested[name] ?? []).every((f) => f(r))), this.nestedOrders[name] ?? []);
    return { rel, found };
  }

  private pick(table: string, row: Row, columns: string, top = false): Row {
    const out: Row = {};
    for (const part of parts(columns)) {
      const embed = part.match(/^(\w+)(?:!inner)?\s*\((.*)\)$/);
      if (part === "*") Object.assign(out, row);
      else if (embed) {
        const { rel, found } = this.related(table, row, embed[1], top);
        const picked = found.map((r) => this.pick(rel.table, r, embed[2]));
        out[embed[1]] = rel.many ? picked : (picked[0] ?? null);
      } else out[part] = row[part] ?? null;
    }
    return structuredClone(out);
  }
}
