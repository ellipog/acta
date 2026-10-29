"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { fetchBoardState } from "@/lib/actions";
import { rememberBoard } from "@/lib/board-cache";
import { defaultPage, type BoardState, type StatusCategory } from "@/lib/board-store";
import { revert, saveChanges } from "@/lib/board-save";
import {
  absorb,
  apply,
  diffBoards,
  SentLog,
  dropGone,
  emptyDiff,
  goneSince,
  renumber,
  resolve,
  taskKey,
  toWire,
  type ActivityRow,
  type BoardRow,
  type CommentRow,
  type Context,
  type RemoteEvent,
  type SuggestionRow,
  type TaskRow,
} from "@/lib/board-sync";
import { toneFor, type LiveBoard } from "@/lib/live";
import { isLive, listen, type Change } from "@/lib/realtime";
import { loadClient } from "@/lib/supabase/browser";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";
import type { DemoAction } from "./demo-state";

// Changes to tasks that sync with GitHub issues, and comments on them, wait in the database until the server sends
// them. A save that could have touched one asks for that, once things settle
const githubFields = new Set<string>(["title", "status", "labels"]);
const githubPings = new Map<string, ReturnType<typeof setTimeout>>();
function pingGitHub(board: string) {
  if (!process.env.NEXT_PUBLIC_GITHUB_APP_SLUG) return;
  clearTimeout(githubPings.get(board));
  githubPings.set(
    board,
    setTimeout(() => {
      githubPings.delete(board);
      void fetch(`/api/github/flush?board=${board}`, { method: "POST", keepalive: true }).catch(() => {});
    }, 1500),
  );
}

export type SaveStatus = "saved" | "saving" | "offline" | "error";
export type Visitor = { id: string; name: string; avatar: string | null; tone: string };

// Changes newer than this before a snapshot are read again when catching up, in case clocks drift
const MARGIN = 60_000;

type Handlers = {
  receive: (ev: RemoteEvent) => void;
  resync: () => Promise<void>;
  catchUp: (since: number) => Promise<void>;
  flush: () => Promise<void>;
  remember: () => void;
};
const idle = async () => {};

export function useBoardSync(live: LiveBoard | undefined, board: BoardState, dispatch: (a: DemoAction) => void) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [here, setHere] = useState<Visitor[]>([]);
  const base = useRef<BoardState | null>(live?.state ?? null);
  const latest = useRef(board);
  const inflight = useRef(false);
  const queue = useRef<RemoteEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useRef(0);
  const token = useRef<string | null>(null);
  const saves = useRef(0);
  const columnTimers = useRef(new Map<StatusCategory, ReturnType<typeof setTimeout>>());
  // What this tab saved lately, so the echo of an older save can't undo a newer one
  const sent = useRef(new SentLog());
  const router = useRouter();
  const boardId = live?.board.id;
  const meId = live?.me.id;
  const prefix = live?.board.prefix ?? "ACT";
  const topic = `board:${boardId}`;

  // The newest server payload, read by the long-lived subscription without restarting it
  const liveRef = useRef(live);
  // When the board on screen last matched the server. Catching up reads only what changed after it
  const syncedAt = useRef(live?.at ?? 0);
  const caughtUp = useRef(false);
  const mounted = useRef(false);
  // The last full snapshot the server sent, to spot comments, activity and ideas deleted since
  const snapshot = useRef(live?.state ?? null);
  // The newest callbacks, for timers and the long-lived subscription
  const handlers = useRef<Handlers>({ receive: () => {}, resync: idle, catchUp: idle, flush: idle, remember: () => {} });

  useEffect(() => {
    liveRef.current = live;
  });

  const knownAt = useCallback(
    () => (isLive(topic) && caughtUp.current && !inflight.current ? Date.now() : syncedAt.current),
    [topic],
  );

  // Keeps what the server has confirmed, so a later visit starts from it and reads only what changed
  const remember = useCallback(() => {
    const now = liveRef.current;
    if (now && base.current) rememberBoard(now, base.current, knownAt());
  }, [knownAt]);

  const ctx = useMemo<Context>(() => {
    const names = new Map((live?.members ?? []).map((m) => [m.id, m.name]));
    return {
      prefix,
      nameOf: (id) => (id && names.get(id)) || "Someone",
      page: (p) => ({
        ...defaultPage,
        ...latest.current.roadmap.page,
        ...p,
        slug: latest.current.roadmap.page.slug,
        stageNames: { ...defaultPage.stageNames, ...p.stageNames },
      }),
    };
  }, [live?.members, prefix]);

  const receiveLater = useRef<(ev: RemoteEvent) => void>(() => {});

  // Someone reordered a column. A reorder arrives as one event per moved card, so this waits for
  // them to settle and reads the column's saved order
  const readColumn = useCallback(
    (status: StatusCategory) => {
      clearTimeout(columnTimers.current.get(status));
      columnTimers.current.set(
        status,
        setTimeout(async () => {
          if (!boardId) return;
          const supabase = await loadClient();
          for (let tries = 0; tries < 5; tries++) {
            const saved = saves.current;
            const { data } = await supabase
              .from("tasks")
              .select("number")
              .eq("board_id", boardId)
              .eq("status", status)
              .is("deleted_at", null)
              .order("position")
              .order("number");
            if (!data) return;
            // A save of ours went out meanwhile, so this order may already be out of date
            if (!inflight.current && saves.current === saved)
              return receiveLater.current({ table: "order", status, numbers: data.map((r) => r.number as number) });
            await new Promise((done) => setTimeout(done, 300));
          }
        }, 150),
      );
    },
    [boardId],
  );

  const receive = useCallback(
    (ev: RemoteEvent) => {
      if (!base.current) return;
      if (inflight.current) {
        queue.current.push(ev);
        return;
      }
      const before = base.current;
      const change = sent.current.screen(resolve(before, ev, ctx));
      if (change.kind === "none") return;
      if (change.kind === "reorder") return readColumn(change.status);
      if (change.kind === "task" && change.add && latest.current.tasks[change.id] && !before.tasks[change.id]) {
        const from = change.id;
        const to = taskKey(prefix, Math.max(latest.current.next, Number(from.split("-").pop()) + 1));
        dispatch({ type: "rebase", current: (b) => renumber(b, from, to), history: (b) => renumber(b, from, to) });
      }
      base.current = apply(before, change);
      dispatch({ type: "rebase", current: (b) => apply(b, change, before), history: (b) => apply(b, change) });
    },
    [ctx, dispatch, prefix, readColumn],
  );

  useEffect(() => {
    receiveLater.current = receive;
  }, [receive]);

  useEffect(() => {
    const timers = columnTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // Reads the whole board again, keeping changes that haven't saved yet. For after a dropped connection
  const resync = useCallback(async () => {
    if (!boardId || inflight.current) return;
    const started = Date.now();
    const fresh = await fetchBoardState(boardId).catch(() => null);
    if (!fresh || inflight.current || !base.current) return;
    const before = base.current;
    base.current = fresh;
    snapshot.current = fresh;
    dispatch({ type: "rebase", current: (b) => absorb(fresh, b, diffBoards(before, b)), history: () => null });
    syncedAt.current = started;
    caughtUp.current = true;
  }, [boardId, dispatch]);

  // Reads only what was saved after `since`, such as between the server reading the board and the live feed
  // starting, or while the board sat in the cache. The margin allows for clocks that drift
  const catchUp = useCallback(
    async (since: number) => {
      if (!boardId) return;
      const started = Date.now();
      const supabase = await loadClient();
      const after = new Date(since - MARGIN).toISOString();
      const [tasks, comments, activity, suggestions, row] = await Promise.all([
        supabase.from("tasks").select("*").eq("board_id", boardId).gt("updated_at", after),
        supabase.from("comments").select("*").eq("board_id", boardId).gt("created_at", after).order("created_at"),
        supabase.from("activity").select("*").eq("board_id", boardId).gt("created_at", after).order("created_at"),
        supabase.from("suggestions").select("*").eq("board_id", boardId).gt("created_at", after),
        supabase.from("boards").select("id, roadmap_public, page, next_number").eq("id", boardId).maybeSingle(),
      ]);
      for (const r of tasks.data ?? []) receive({ table: "tasks", row: r as TaskRow });
      for (const r of comments.data ?? []) receive({ table: "comments", row: r as CommentRow });
      for (const r of activity.data ?? []) receive({ table: "activity", row: r as ActivityRow });
      // Work an agent brings over keeps its old dates, so whatever changed on a task reads its threads again
      const touched = [...new Set([...(tasks.data ?? []), ...(activity.data ?? [])].map((r) => r.number as number))];
      if (touched.length) {
        const [older, olderActivity] = await Promise.all([
          supabase.from("comments").select("*").eq("board_id", boardId).in("number", touched).lte("created_at", after),
          supabase.from("activity").select("*").eq("board_id", boardId).in("number", touched).lte("created_at", after),
        ]);
        for (const r of older.data ?? []) receive({ table: "comments", row: r as CommentRow });
        for (const r of olderActivity.data ?? []) receive({ table: "activity", row: r as ActivityRow });
      }
      for (const r of suggestions.data ?? []) receive({ table: "suggestions", row: r as SuggestionRow });
      if (row.data) receive({ table: "boards", row: row.data as BoardRow });
      if (!tasks.error && !comments.error && !activity.error) {
        syncedAt.current = started;
        caughtUp.current = true;
      }
    },
    [boardId, receive],
  );

  const flush = useCallback(async () => {
    if (!boardId || !base.current || inflight.current) return;
    const target = latest.current;
    if (emptyDiff(diffBoards(base.current, target))) {
      setStatus("saved");
      return;
    }
    inflight.current = true;
    saves.current++;
    setStatus("saving");
    const supabase = await loadClient();
    const result = await saveChanges(
      base.current,
      target,
      async (changes) => supabase.rpc("apply_board_changes", { p_board: boardId, p_changes: changes }),
      prefix,
    );
    inflight.current = false;

    for (const [a, b] of result.renamed)
      dispatch({ type: "rebase", current: (s) => renumber(s, a, b), history: (s) => renumber(s, a, b) });
    for (const part of result.saved) sent.current.record(part, result.goal);
    if (
      result.saved.some(
        (d) => d.comments.length || d.uncomments.length || d.updated.some((u) => u.fields.some((f) => githubFields.has(f))),
      )
    )
      pingGitHub(boardId);
    base.current = result.base;
    const saved = result.base;
    if (result.refused.length) {
      // Only what the database turned down comes off the board. Everything else was saved
      dispatch({
        type: "rebase",
        current: (s) => result.refused.reduce((b, r) => revert(b, saved, r.diff), s),
        history: (s) => s,
      });
      const [one] = result.refused;
      toast({
        icon: "x",
        title: result.refused.length === 1 ? `${one.what} didn’t save` : `${result.refused.length} changes didn’t save`,
        description:
          result.refused.length === 1
            ? `${one.why} It was undone, and your other changes are saved.`
            : `${result.refused.map((r) => r.what).join(", ")}. ${one.why} Your other changes are saved.`,
      });
    }
    const pending = queue.current;
    queue.current = [];
    pending.forEach(receive);

    if (result.waiting) {
      // Nothing is lost: the changes stay on screen and go again after a pause
      setStatus("offline");
      const wait = Math.min(30_000, 1000 * 2 ** retry.current++);
      timer.current = setTimeout(() => void handlers.current.flush(), wait);
      return;
    }
    retry.current = 0;
    if (latest.current !== target || result.refused.length)
      timer.current = setTimeout(() => void handlers.current.flush(), 50);
    else setStatus("saved");
    if (!mounted.current) remember();
  }, [boardId, dispatch, prefix, receive, remember]);

  // The subscription lives as long as the board is on screen, so it reads these through a ref
  useEffect(() => {
    handlers.current = { receive, resync, catchUp, flush, remember };
  });

  useEffect(() => {
    latest.current = board;
    if (!boardId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 250);
  }, [board, boardId, flush]);

  // A newer copy of the board from the server, after a refresh or when a board shown from the cache finishes
  // loading. Changes reach the board through the live feed, but deletions of comments, activity and ideas
  // leave no row behind to read, so those are found by comparing the two copies
  useEffect(() => {
    if (!live || !snapshot.current || live.state === snapshot.current) return;
    const gone = goneSince(snapshot.current, live.state);
    snapshot.current = live.state;
    if (!gone) return;
    if (base.current) base.current = dropGone(base.current, gone);
    dispatch({ type: "rebase", current: (b) => dropGone(b, gone), history: (b) => dropGone(b, gone) });
  }, [live, dispatch]);

  useEffect(() => {
    if (!boardId || !meId) return;
    const me = liveRef.current!.me;
    const filter = `board_id=eq.${boardId}`;
    const row = (p: Change) => (p.eventType === "DELETE" ? undefined : (p.new as never));
    caughtUp.current = false;
    mounted.current = true;
    const stop = listen(
      topic,
      [
        { table: "tasks", filter },
        { table: "comments", filter },
        { table: "activity", filter },
        { table: "suggestions", filter },
        { table: "boards", filter: `id=eq.${boardId}` },
      ],
      {
        change: (table, p) => {
          const { receive } = handlers.current;
          if (table === "tasks") {
            if (p.new && "number" in p.new) receive({ table: "tasks", row: p.new as never });
          } else if (table === "boards") {
            if (p.eventType !== "UPDATE") return;
            const next = p.new as { name?: string; labels?: unknown; projects?: unknown };
            const now = liveRef.current?.board;
            // The name, labels and projects come with the page, so a change to them reads the page again
            if (now && JSON.stringify([next.name, next.labels, next.projects]) !== JSON.stringify([now.name, now.labels, now.projects]))
              router.refresh();
            receive({ table: "boards", row: p.new as never });
          } else receive({ table, row: row(p), old: p.old as never } as RemoteEvent);
        },
        joined: (again) => {
          caughtUp.current = false;
          // After a dropped connection the gap could be long, so that reads the board again
          void (again ? handlers.current.resync() : handlers.current.catchUp(syncedAt.current));
        },
        presence: (state) => {
          const seen = new Map<string, Visitor>();
          for (const list of Object.values(state))
            for (const v of list as Visitor[]) if (v.id && v.id !== me.id) seen.set(v.id, v);
          setHere([...seen.values()]);
        },
      },
      { key: me.id, me: { id: me.id, name: me.name, avatar: me.avatar, tone: toneFor(me.id) } },
    );
    return () => {
      // Hidden or gone: what's on screen was current until now, as long as the feed was live
      syncedAt.current = knownAt();
      caughtUp.current = false;
      mounted.current = false;
      stop();
      setHere([]);
      // Changes still waiting to save go now rather than after the pause
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void handlers.current.flush();
      }
      handlers.current.remember();
    };
  }, [boardId, meId, topic, router, knownAt, remember]);

  useEffect(() => {
    if (!boardId) return;
    let unsubscribe = () => {};
    let stopped = false;
    void loadClient().then((client) => {
      if (stopped) return;
      void client.auth.getSession().then(({ data }) => {
        token.current = data.session?.access_token ?? token.current;
      });
      const auth = client.auth.onAuthStateChange((_e, session) => {
        token.current = session?.access_token ?? null;
      });
      unsubscribe = () => auth.data.subscription.unsubscribe();
    });

    // Closing the tab can't wait for a normal save, so this sends what's left with keepalive
    const save = () => {
      if (!base.current || !token.current || inflight.current) return;
      const d = diffBoards(base.current, latest.current);
      if (emptyDiff(d)) return;
      if (timer.current) clearTimeout(timer.current);
      void fetch(`${supabaseUrl}/rest/v1/rpc/apply_board_changes`, {
        method: "POST",
        keepalive: true,
        headers: { apikey: supabaseKey, authorization: `Bearer ${token.current}`, "content-type": "application/json" },
        body: JSON.stringify({ p_board: boardId, p_changes: toWire(d, latest.current) }),
      }).catch(() => {});
      base.current = absorb(base.current, latest.current, d);
    };
    const hidden = () => {
      if (document.visibilityState !== "hidden") return;
      if (timer.current) clearTimeout(timer.current);
      void handlers.current.flush();
    };
    const shown = (e: PageTransitionEvent) => {
      if (e.persisted) void handlers.current.resync();
    };
    const online = () => void handlers.current.flush();
    window.addEventListener("pagehide", save);
    window.addEventListener("pageshow", shown);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("online", online);

    return () => {
      stopped = true;
      unsubscribe();
      window.removeEventListener("pagehide", save);
      window.removeEventListener("pageshow", shown);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("online", online);
    };
  }, [boardId]);

  return { status, here, knownAt };
}
