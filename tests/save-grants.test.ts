import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The board saves through apply_board_changes as the person signed in, and Postgres refuses a statement that
// names any column they weren't granted, even one it leaves as it was. The fake server in these tests can't see
// that, so this reads the migrations: every column the latest save function writes has to be granted

const dir = join(import.meta.dir, "..", "supabase", "migrations");
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8").replace(/--[^\n]*/g, ""))
  .join("\n");

type Grants = Map<string, { insert: Set<string> | "all"; update: Set<string> | "all" }>;

function grants(): Grants {
  const out: Grants = new Map();
  const of = (table: string) => {
    if (!out.has(table)) out.set(table, { insert: new Set(), update: new Set() });
    return out.get(table)!;
  };
  const re = /grant\s+([^;]+?)\s+on\s+(?:table\s+)?([\w.,\s]+?)\s+to\s+([\w,\s]+);/gi;
  for (const [, what, tables, roles] of sql.matchAll(re)) {
    if (!/\bauthenticated\b/.test(roles) || /\bfunction\b/i.test(tables)) continue;
    for (const table of tables.split(",").map((t) => t.trim())) {
      const g = of(table);
      for (const [, verb, cols] of what.matchAll(/\b(insert|update|all)\b\s*(?:\(([^)]*)\))?/gi)) {
        for (const v of verb.toLowerCase() === "all" ? (["insert", "update"] as const) : [verb.toLowerCase() as "insert" | "update"]) {
          const set = g[v];
          if (!cols) g[v] = "all";
          else if (set !== "all") cols.split(",").forEach((c) => set.add(c.trim()));
        }
      }
    }
  }
  return out;
}

// The columns each statement in the latest save function writes. What only agents run is left out: their saves
// go through functions that run with the owner's rights
function writes() {
  const all = [...sql.matchAll(/function public\.apply_board_changes\(p_board uuid, p_changes jsonb\)([\s\S]*?)\n\$\$;/g)];
  const body = all.at(-1)![1].replace(/\n\s*if agent then[\s\S]*?\n\s*end if;/g, "");
  const found: { table: string; verb: "insert" | "update"; columns: string[] }[] = [];
  for (const [, table, cols] of body.matchAll(/insert into (public\.\w+)(?: as \w+)?\s*\(([^)]*)\)/g))
    found.push({ table, verb: "insert", columns: cols.split(",").map((c) => c.trim()) });
  for (const [, table, set] of body.matchAll(/update (public\.\w+)(?: \w+)? set([\s\S]*?)\bwhere\b/g))
    found.push({ table, verb: "update", columns: [...set.matchAll(/(?:^|,)\s*(\w+) =/g)].map((m) => m[1]) });
  for (const [, table, set] of body.matchAll(/insert into (public\.\w+)[\s\S]*?on conflict[^;]*?do update set([\s\S]*?)(?:\bwhere\b|;)/g))
    found.push({ table, verb: "update", columns: [...set.matchAll(/(?:^|,)\s*(\w+) =/g)].map((m) => m[1]) });
  return found;
}

test("the save function finds what it writes", () => {
  const w = writes();
  expect(w.some((s) => s.table === "public.tasks" && s.verb === "update" && s.columns.includes("assignee"))).toBe(true);
  expect(w.some((s) => s.table === "public.comments" && s.verb === "insert")).toBe(true);
});

test("signed-in people may write every column the board saves", () => {
  const g = grants();
  const missing: string[] = [];
  for (const { table, verb, columns } of writes()) {
    const allowed = g.get(table)?.[verb];
    for (const c of columns) if (allowed !== "all" && !allowed?.has(c)) missing.push(`${verb} ${table}.${c}`);
  }
  expect([...new Set(missing)]).toEqual([]);
});
