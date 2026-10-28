import { useSyncExternalStore } from "react";
import { loadClient } from "@/lib/supabase/browser";

// Settings that follow you between devices: each board's view (`prefs-<board id>`) and the order of a workspace's
// boards in the sidebar (`order-<workspace id>`). The browser's own copy is what's read, so nothing waits on the
// network. Changes are written to the account a moment later, and the account is read in the background once a
// visit, and again on coming back to the tab, to pick up what changed on another device.

type Sync = {
  // Whose settings the browser holds. Someone else signing in mustn't send theirs to the new account
  user?: string;
  // The account's time for each setting as last seen here, and which ones changed here since
  at: Record<string, string>;
  dirty: Record<string, true>;
};

const SYNC = "acta-sync";
const local = (key: string) => `acta-${key}`;
const synced = /^acta-((?:prefs|order)-[0-9a-f-]{36})$/;

let user: string | null = null;
let pulled = 0;
let pulling: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
// Bumped with each change, so a write that lands after a newer change doesn't mark that one saved
const version: Record<string, number> = {};
const listeners = new Map<string, Set<() => void>>();

function readSync(): Sync {
  try {
    const s = JSON.parse(localStorage.getItem(SYNC) ?? "null");
    if (s && typeof s === "object") return { user: s.user, at: s.at ?? {}, dirty: s.dirty ?? {} };
  } catch {}
  return { at: {}, dirty: {} };
}

function writeSync(s: Sync) {
  try {
    localStorage.setItem(SYNC, JSON.stringify(s));
  } catch {}
}

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

/** The browser's copy of a setting */
export function readPref<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(local(key));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Changes a setting here at once, and on the account shortly after. Signed-out pages only keep it here */
export function writePref(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  try {
    if (localStorage.getItem(local(key)) === raw) return;
    localStorage.setItem(local(key), raw);
  } catch {
    return;
  }
  version[key] = (version[key] ?? 0) + 1;
  const s = readSync();
  s.dirty[key] = true;
  writeSync(s);
  emit(key);
  schedule();
}

/** Runs when a setting changes, here or on another device */
export function onPref(key: string, run: () => void) {
  const set = listeners.get(key) ?? new Set();
  set.add(run);
  listeners.set(key, set);
  return () => void set.delete(run);
}

function schedule() {
  if (!user) return;
  clearTimeout(timer);
  timer = setTimeout(() => void push(), 800);
}

async function push() {
  const s = readSync();
  const keys = Object.keys(s.dirty);
  if (!user || !keys.length) return;
  const sent = Object.fromEntries(keys.map((k) => [k, version[k] ?? 0]));
  const rows = keys.flatMap((key) => {
    const value = readPref(key);
    return value === null ? [] : [{ user_id: user, key, value }];
  });
  const supabase = await loadClient();
  const { data, error } = await supabase
    .from("user_prefs")
    .upsert(rows, { onConflict: "user_id,key" })
    .select("key, updated_at");
  if (error) return;
  const after = readSync();
  for (const row of data ?? []) {
    after.at[row.key] = row.updated_at;
    if ((version[row.key] ?? 0) === sent[row.key]) delete after.dirty[row.key];
  }
  writeSync(after);
}

async function pull(me: string) {
  const s = readSync();
  // Settings left by someone else stay on this device but never reach this account, while the first account to
  // sign in here takes what was set before settings followed people around
  const fresh = s.user === undefined;
  if (s.user !== me) {
    s.user = me;
    s.at = {};
    s.dirty = {};
  }
  const supabase = await loadClient();
  const { data, error } = await supabase.from("user_prefs").select("key, value, updated_at");
  // Before the migration runs there's nowhere to keep them, and the browser's copy carries on alone
  if (error) return;
  const there = new Set<string>();
  const changed: string[] = [];
  for (const row of data ?? []) {
    there.add(row.key);
    if (s.dirty[row.key] || s.at[row.key] === row.updated_at) continue;
    s.at[row.key] = row.updated_at;
    try {
      localStorage.setItem(local(row.key), JSON.stringify(row.value));
    } catch {}
    changed.push(row.key);
  }
  if (fresh)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)?.match(synced)?.[1];
      if (key && !there.has(key)) s.dirty[key] = true;
    }
  writeSync(s);
  changed.forEach(emit);
  if (Object.keys(s.dirty).length) await push();
}

/** Starts keeping settings in step with the account of whoever is signed in. Safe to call on every page */
export function syncPrefs(me: string) {
  if (typeof window === "undefined") return;
  const first = user === null;
  user = me;
  if (first) {
    const again = () => {
      if (document.visibilityState === "hidden") {
        // Whatever is waiting goes now, since the tab may not come back
        clearTimeout(timer);
        void push();
      } else if (user && Date.now() - pulled > 30_000) void syncNow();
    };
    document.addEventListener("visibilitychange", again);
  }
  if (!pulling) void syncNow();
}

function syncNow() {
  if (!user || pulling) return pulling;
  pulled = Date.now();
  pulling = pull(user)
    .catch(() => {})
    .finally(() => (pulling = null));
  return pulling;
}

/** Boards in the order someone chose, with any they haven't placed yet after them */
export function inOrder<T extends { id: string }>(boards: T[], order: string[] | null): T[] {
  if (!order?.length) return boards;
  const rank = new Map(order.map((id, i) => [id, i]));
  return boards
    .map((b, i) => ({ b, i }))
    .sort((x, y) => (rank.get(x.b.id) ?? order.length + x.i) - (rank.get(y.b.id) ?? order.length + y.i))
    .map(({ b }) => b);
}

const orderCache = new Map<string, { raw: string | null; order: string[] | null }>();

function orderOf(workspace: string) {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(local(`order-${workspace}`));
  } catch {}
  const hit = orderCache.get(workspace);
  if (hit && hit.raw === raw) return hit.order;
  let order: string[] | null = null;
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) order = parsed.filter((x) => typeof x === "string");
  } catch {}
  orderCache.set(workspace, { raw, order });
  return order;
}

/** The order someone keeps a workspace's boards in, which the sidebar shows them in */
export function useBoardOrder(workspace: string) {
  return useSyncExternalStore(
    (run) => onPref(`order-${workspace}`, run),
    () => orderOf(workspace),
    () => null,
  );
}

export const setBoardOrder = (workspace: string, ids: string[]) => writePref(`order-${workspace}`, ids);
