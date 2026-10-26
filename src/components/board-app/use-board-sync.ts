"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { toast } from "@/components/ui/toast";
import { fetchBoardState } from "@/lib/actions";
import { defaultPage, type BoardState, type StatusCategory } from "@/lib/board-store";
import {
  absorb,
  apply,
  diffBoards,
  emptyDiff,
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
import { loadClient } from "@/lib/supabase/browser";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";
import type { DemoAction } from "./demo-state";

export type SaveStatus = "saved" | "saving" | "offline" | "error";
export type Visitor = { id: string; name: string; avatar: string | null; tone: string };

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
  const again = useRef<() => void>(() => {});
  const saves = useRef(0);
  const columnTimers = useRef(new Map<StatusCategory, ReturnType<typeof setTimeout>>());
  const receiveLater = useRef<(ev: RemoteEvent) => void>(() => {});
  const router = useRouter();
  const shape = useRef("");
  const boardId = live?.board.id;
  const prefix = live?.board.prefix ?? "ACT";

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
      const change = resolve(before, ev, ctx);
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

  const resync = useCallback(async () => {
    if (!boardId || inflight.current) return;
    const fresh = await fetchBoardState(boardId).catch(() => null);
    if (!fresh || inflight.current || !base.current) return;
    const before = base.current;
    base.current = fresh;
    dispatch({ type: "rebase", current: (b) => absorb(fresh, b, diffBoards(before, b)), history: () => null });
  }, [boardId, dispatch]);

  // Picks up anything saved between the server reading the board and the live feed starting,
  // without reading the whole board again. The margin allows for clocks that drift
  const catchUp = useCallback(async () => {
    if (!boardId || !live) return;
    const supabase = await loadClient();
    const since = new Date(live.at - 60_000).toISOString();
    const [tasks, comments, activity, suggestions, row] = await Promise.all([
      supabase.from("tasks").select("*").eq("board_id", boardId).gt("updated_at", since),
      supabase.from("comments").select("*").eq("board_id", boardId).gt("created_at", since).order("created_at"),
      supabase.from("activity").select("*").eq("board_id", boardId).gt("created_at", since).order("created_at"),
      supabase.from("suggestions").select("*").eq("board_id", boardId).gt("created_at", since),
      supabase.from("boards").select("id, roadmap_public, page, next_number").eq("id", boardId).maybeSingle(),
    ]);
    for (const r of tasks.data ?? []) receive({ table: "tasks", row: r as TaskRow });
    for (const r of comments.data ?? []) receive({ table: "comments", row: r as CommentRow });
    for (const r of activity.data ?? []) receive({ table: "activity", row: r as ActivityRow });
    for (const r of suggestions.data ?? []) receive({ table: "suggestions", row: r as SuggestionRow });
    if (row.data) receive({ table: "boards", row: row.data as BoardRow });
  }, [boardId, live, receive]);

  const flush = useCallback(async () => {
    if (!boardId || !base.current || inflight.current) return;
    const target = latest.current;
    const d = diffBoards(base.current, target);
    if (emptyDiff(d)) {
      setStatus("saved");
      return;
    }
    inflight.current = true;
    saves.current++;
    setStatus("saving");
    const supabase = await loadClient();
    const { data, error } = await supabase.rpc("apply_board_changes", {
      p_board: boardId,
      p_changes: toWire(d, target),
    });
    inflight.current = false;

    if (error) {
      const network = !error.code || /fetch|network/i.test(error.message);
      if (network) {
        setStatus("offline");
        const wait = Math.min(30_000, 1000 * 2 ** retry.current++);
        timer.current = setTimeout(() => again.current(), wait);
      } else {
        setStatus("error");
        toast({
          icon: "x",
          title: "A change didn’t save",
          description: "We reloaded the board so it matches what’s saved.",
        });
        retry.current = 0;
        base.current = null;
        const fresh = await fetchBoardState(boardId).catch(() => null);
        if (fresh) {
          base.current = fresh;
          dispatch({ type: "rebase", current: () => fresh, history: () => null });
          setStatus("saved");
        }
      }
      const pending = queue.current;
      queue.current = [];
      pending.forEach(receive);
      return;
    }

    retry.current = 0;
    let next = absorb(base.current, target, d);
    const result = data as { moved: Record<string, number>; next: number };
    for (const [from, to] of Object.entries(result.moved ?? {})) {
      const a = taskKey(prefix, Number(from));
      const b = taskKey(prefix, to);
      next = renumber(next, a, b);
      dispatch({ type: "rebase", current: (s) => renumber(s, a, b), history: (s) => renumber(s, a, b) });
    }
    base.current = { ...next, next: Math.max(next.next, result.next ?? 0) };
    const pending = queue.current;
    queue.current = [];
    pending.forEach(receive);
    if (latest.current !== target) timer.current = setTimeout(() => again.current(), 50);
    else setStatus("saved");
  }, [boardId, dispatch, prefix, receive]);

  useEffect(() => {
    again.current = () => void flush();
  }, [flush]);

  useEffect(() => {
    if (live) shape.current = JSON.stringify([live.board.name, live.board.labels, live.board.projects]);
  }, [live]);

  useEffect(() => {
    latest.current = board;
    if (!boardId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 250);
  }, [board, boardId, flush]);

  useEffect(() => {
    if (!boardId || !live) return;
    let supabase: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;
    let unsubscribe = () => {};

    const changes = (table: "tasks" | "comments" | "activity" | "suggestions") =>
      ({ event: "*", schema: "public", table, filter: `board_id=eq.${boardId}` }) as const;

    let stopped = false;
    let joined = false;
    const start = async () => {
      const client = await loadClient();
      if (stopped) return;
      supabase = client;
      const auth = client.auth.onAuthStateChange((_e, session) => {
        token.current = session?.access_token ?? null;
      });
      unsubscribe = () => auth.data.subscription.unsubscribe();
      await client.realtime.setAuth().catch(() => {});
      if (stopped) return;
      channel = client
        .channel(`board:${boardId}`, { config: { presence: { key: live.me.id } } })
        .on("postgres_changes", changes("tasks"), (p) => {
          if (p.new && "number" in p.new) receive({ table: "tasks", row: p.new as never });
        })
        .on("postgres_changes", changes("comments"), (p) =>
          receive({
            table: "comments",
            row: p.eventType === "DELETE" ? undefined : (p.new as never),
            old: p.old as never,
          }),
        )
        .on("postgres_changes", changes("activity"), (p) =>
          receive({
            table: "activity",
            row: p.eventType === "DELETE" ? undefined : (p.new as never),
            old: p.old as never,
          }),
        )
        .on("postgres_changes", changes("suggestions"), (p) =>
          receive({
            table: "suggestions",
            row: p.eventType === "DELETE" ? undefined : (p.new as never),
            old: p.old as never,
          }),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "boards", filter: `id=eq.${boardId}` },
          (p) => {
            const row = p.new as { name?: string; labels?: unknown; projects?: unknown };
            if (JSON.stringify([row.name, row.labels, row.projects]) !== shape.current) router.refresh();
            receive({ table: "boards", row: p.new as never });
          },
        )
        .on("presence", { event: "sync" }, () => {
          const state = channel!.presenceState<Visitor>();
          const seen = new Map<string, Visitor>();
          for (const list of Object.values(state)) for (const v of list) if (v.id !== live.me.id) seen.set(v.id, v);
          setHere([...seen.values()]);
        })
        .subscribe((s) => {
          if (s === "SUBSCRIBED") {
            channel!.track({ id: live.me.id, name: live.me.name, avatar: live.me.avatar, tone: toneFor(live.me.id) });
            // After a dropped connection the gap could be long, so that reads the board again
            void (joined ? resync() : catchUp());
            joined = true;
          }
        });
    };
    void start();

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
      void flush();
    };
    const shown = (e: PageTransitionEvent) => {
      if (e.persisted) void resync();
    };
    const online = () => void flush();
    window.addEventListener("pagehide", save);
    window.addEventListener("pageshow", shown);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("online", online);

    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", save);
      window.removeEventListener("pageshow", shown);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("online", online);
      stopped = true;
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [boardId, live, receive, resync, catchUp, flush, router]);

  return { status, here };
}
