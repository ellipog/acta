import { afterAll, beforeEach, expect, mock, test } from "bun:test";

// Settings that follow someone between devices. Each device reads its own copy straight away, sends changes to the
// account a moment later, and picks up what changed elsewhere. These check one device never sends its defaults over
// what the account holds, that changes made elsewhere arrive, and that one person's settings never reach another

const BOARD = "prefs-11111111-1111-4111-8111-111111111111";
const ORDER = "order-22222222-2222-4222-8222-222222222222";

// The account, as the user_prefs table holds it for whoever is signed in
let signedIn = "ada";
let clock = 0;
const accounts = new Map<string, Map<string, { value: unknown; updated_at: string }>>();
const account = (who = signedIn) => accounts.get(who) ?? accounts.set(who, new Map()).get(who)!;
let reads = 0;

const fake = {
  from: () => ({
    select: async () => {
      reads++;
      return { data: [...account()].map(([key, row]) => ({ key, ...row })), error: null };
    },
    upsert: (rows: { key: string; value: unknown }[]) => ({
      select: async () => {
        const data = rows.map(({ key, value }) => {
          const updated_at = new Date(++clock * 1000).toISOString();
          account().set(key, { value, updated_at });
          return { key, updated_at };
        });
        return { data, error: null };
      },
    }),
  }),
};
mock.module("@/lib/supabase/browser", () => ({ loadClient: async () => fake }));

// One browser
const store = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
const had = { window: g.window, localStorage: g.localStorage, document: Object.getOwnPropertyDescriptor(g, "document") };
g.window = {};
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
Object.defineProperty(g, "document", {
  value: { visibilityState: "visible", addEventListener: () => {} },
  configurable: true,
});
afterAll(() => {
  g.window = had.window;
  g.localStorage = had.localStorage;
  if (had.document) Object.defineProperty(g, "document", had.document);
  else delete g.document;
});

// Each test is a fresh visit, so the module's memory of who is signed in starts over
const visit = async () => {
  const m = await import(`@/lib/account-prefs?visit=${Math.random()}`);
  return m as typeof import("@/lib/account-prefs");
};
const settle = () => new Promise((r) => setTimeout(r, 900));

beforeEach(() => {
  store.clear();
  accounts.clear();
  signedIn = "ada";
  reads = 0;
});

test("a change shows at once and reaches the account shortly after", async () => {
  const p = await visit();
  p.syncPrefs("ada");
  await settle();
  p.writePref(BOARD, { view: "board" });
  expect(p.readPref(BOARD)).toEqual({ view: "board" });
  expect(account().get(BOARD)).toBeUndefined();
  await settle();
  expect(account().get(BOARD)?.value).toEqual({ view: "board" });
});

test("a new device takes the account's settings and tells whoever is showing them", async () => {
  account().set(ORDER, { value: ["b", "a"], updated_at: "2026-10-28T10:00:00.000Z" });
  const p = await visit();
  let heard = 0;
  p.onPref(ORDER, () => heard++);
  p.syncPrefs("ada");
  await settle();
  expect(p.readPref(ORDER)).toEqual(["b", "a"]);
  expect(heard).toBe(1);
  expect(p.inOrder([{ id: "a" }, { id: "b" }, { id: "c" }], p.readPref(ORDER)).map((b) => b.id)).toEqual([
    "b",
    "a",
    "c",
  ]);
});

test("settings from before they followed people go to the first account that signs in, and only that one", async () => {
  store.set(`acta-${BOARD}`, JSON.stringify({ grouping: "priority" }));
  const first = await visit();
  first.syncPrefs("ada");
  await settle();
  expect(account("ada").get(BOARD)?.value).toEqual({ grouping: "priority" });

  signedIn = "bo";
  const second = await visit();
  second.syncPrefs("bo");
  await settle();
  expect(account("bo").size).toBe(0);
});

test("a change made here isn't lost to an older one from the account", async () => {
  const p = await visit();
  p.syncPrefs("ada");
  await settle();
  account().set(BOARD, { value: { view: "table" }, updated_at: "2026-10-28T09:00:00.000Z" });
  p.writePref(BOARD, { view: "roadmap" });
  await settle();
  expect(account().get(BOARD)?.value).toEqual({ view: "roadmap" });
  expect(p.readPref(BOARD)).toEqual({ view: "roadmap" });
});

test("writing what's already there sends nothing", async () => {
  const p = await visit();
  p.syncPrefs("ada");
  await settle();
  p.writePref(BOARD, { view: "board" });
  await settle();
  const at = account().get(BOARD)?.updated_at;
  p.writePref(BOARD, { view: "board" });
  await settle();
  expect(account().get(BOARD)?.updated_at).toBe(at);
  expect(reads).toBe(1);
});
