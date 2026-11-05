import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// A key's name, access and workspaces can change after it's made, by the person who made it. Its hash, hint and
// owner can't, so a change never makes it a different key or someone else's

const dir = join(import.meta.dir, "..", "supabase", "migrations");
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8").replace(/--[^\n]*/g, ""))
  .join("\n");

const updatable = () =>
  [...sql.matchAll(/grant\s+update\s*\(([^)]*)\)\s+on\s+public\.agent_keys\s+to\s+authenticated\s*;/gi)].flatMap((m) =>
    m[1].split(",").map((c) => c.trim()),
  );

test("people may change a key's name, access and workspaces", () => {
  expect(updatable().sort()).toEqual(["access", "name", "workspaces"]);
});

test("nobody signed in may change a key's hash, hint or owner", () => {
  expect(sql).not.toMatch(/grant\s+[^;]*\bupdate\b(?!\s*\()[^;]*\bon\s+public\.agent_keys\s+to\s+[^;]*\bauthenticated\b/i);
  for (const column of ["hash", "hint", "user_id", "created_at", "used_at"]) expect(updatable()).not.toContain(column);
});

test("only a key's owner may change it", () => {
  const policy = sql.match(/create policy "[^"]+" on public\.agent_keys\s+for update to authenticated([\s\S]*?);/i);
  expect(policy).not.toBeNull();
  expect(policy![1]).toMatch(/using \(user_id = \(select auth\.uid\(\)\)\)/);
  expect(policy![1]).toMatch(/with check \(user_id = \(select auth\.uid\(\)\)\)/);
});
