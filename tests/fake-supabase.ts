// A stand-in for Supabase behind the agent API: the PostgREST queries acta.ts and keys.ts make, and agent_apply,
// over tables kept in memory. Every query and rpc is one round trip, recorded in calls, and rounds counts how many
// of them had to wait for one before, which is what a request's time on the network comes down to

type Row = Record<string, unknown>;
type Err = { code?: string; message: string };
type Result = { data: unknown; error: Err | null; count?: number | null };

// The embeds the agent API asks for, as PostgREST resolves them from foreign keys
const relations: Record<string, Record<string, { table: string; local: string; foreign: string }>> = {
  members: {
    workspaces: { table: "workspaces", local: "workspace_id", foreign: "id" },
    profiles: { table: "profiles", local: "user_id", foreign: "id" },
  },
};

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
    if (name !== "agent_apply") return { data: null, error: { code: "PGRST202", message: `No function ${name}` } };
    const changes = args.p_changes as Record<string, unknown>;
    this.applied.push(structuredClone(changes));
    const refused = this.refuse?.(changes);
    if (refused) return { data: null, error: refused };
    const saved = structuredClone(this.tables);
    try {
      return { data: this.apply(args.p_board as string, changes), error: null };
    } catch (e) {
      // One failed part undoes the whole call, like the transaction it runs in
      this.tables = saved;
      return { data: null, error: e as Err };
    }
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
  private orders: { column: string; ascending: boolean }[] = [];
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
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((r) => r[column] !== value);
    return this;
  }
  is(column: string, value: null) {
    this.filters.push((r) => (r[column] ?? null) === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[column]));
    return this;
  }
  not(column: string, op: string, value: unknown) {
    if (op !== "is") throw new Error(`The fake can’t do not.${op}`);
    this.filters.push((r) => (r[column] ?? null) !== value);
    return this;
  }
  contains(column: string, values: unknown[]) {
    this.filters.push((r) => values.every((v) => ((r[column] ?? []) as unknown[]).includes(v)));
    return this;
  }
  overlaps(column: string, values: unknown[]) {
    this.filters.push((r) => values.some((v) => ((r[column] ?? []) as unknown[]).includes(v)));
    return this;
  }
  or(): this {
    throw new Error("The fake can’t do or filters");
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false });
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
    hits = [...hits].sort((a, b) => {
      for (const { column, ascending } of this.orders) {
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
    const count = hits.length;
    if (this.max !== undefined) hits = hits.slice(0, this.max);
    if (this.head) return { data: null, error: null, count };
    const data = hits.map((r) => this.pick(this.table, r, this.columns));
    if (this.one) {
      if (data.length > 1) return { data: null, error: { code: "PGRST116", message: "More than one row" } };
      return { data: data[0] ?? null, error: null };
    }
    return { data, error: null, count: this.counted ? count : null };
  }

  private pick(table: string, row: Row, columns: string): Row {
    const out: Row = {};
    for (const part of parts(columns)) {
      const embed = part.match(/^(\w+)\s*\((.*)\)$/);
      if (part === "*") Object.assign(out, row);
      else if (embed) {
        const rel = relations[table]?.[embed[1]];
        if (!rel) throw new Error(`The fake doesn’t know ${table}.${embed[1]}`);
        const other = this.db.rows(rel.table).find((r) => r[rel.foreign] === row[rel.local]);
        out[embed[1]] = other ? this.pick(rel.table, other, embed[2]) : null;
      } else out[part] = row[part] ?? null;
    }
    return structuredClone(out);
  }
}
