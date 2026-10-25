"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "@/components/ui/toast";
import { fetchBoardState } from "@/lib/actions";
import { defaultPage, type BoardState } from "@/lib/board-store";
import {
  absorb,
  apply,
  diffBoards,
  emptyDiff,
  renumber,
  resolve,
  taskKey,
  toWire,
  type Context,
  type RemoteEvent,
} from "@/lib/board-sync";
import { toneFor, type LiveBoard } from "@/lib/live";
import { getBrowserClient } from "@/lib/supabase/client";
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
      if (change.kind === "task" && change.add && latest.current.tasks[change.id] && !before.tasks[change.id]) {
        const from = change.id;
        const to = taskKey(prefix, Math.max(latest.current.next, Number(from.split("-").pop()) + 1));
        dispatch({ type: "rebase", current: (b) => renumber(b, from, to), history: (b) => renumber(b, from, to) });
      }
      base.current = apply(before, change);
      dispatch({ type: "rebase", current: (b) => apply(b, change, before), history: (b) => apply(b, change) });
    },
    [ctx, dispatch, prefix],
  );

  const resync = useCallback(async () => {
    if (!boardId || inflight.current) return;
    const fresh = await fetchBoardState(boardId).catch(() => null);
    if (!fresh || inflight.current || !base.current) return;
    const before = base.current;
    base.current = fresh;
    dispatch({ type: "rebase", current: (b) => absorb(fresh, b, diffBoards(before, b)), history: () => null });
  }, [boardId, dispatch]);

  const flush = useCallback(async () => {
    if (!boardId || !base.current || inflight.current) return;
    const target = latest.current;
    const d = diffBoards(base.current, target);
    if (emptyDiff(d)) {
      setStatus("saved");
      return;
    }
    inflight.current = true;
    setStatus("saving");
    const supabase = getBrowserClient();
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
    latest.current = board;
    if (!boardId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 250);
  }, [board, boardId, flush]);

  useEffect(() => {
    if (!boardId || !live) return;
    const supabase = getBrowserClient();
    let channel: RealtimeChannel | null = null;

    const auth = supabase.auth.onAuthStateChange((_e, session) => {
      token.current = session?.access_token ?? null;
    });

    const changes = (table: "tasks" | "comments" | "activity" | "suggestions") =>
      ({ event: "*", schema: "public", table, filter: `board_id=eq.${boardId}` }) as const;

    channel = supabase
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
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "boards", filter: `id=eq.${boardId}` }, (p) =>
        receive({ table: "boards", row: p.new as never }),
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
          void resync();
        }
      });

    const save = () => {
      if (!base.current || !token.current) return;
      const d = diffBoards(base.current, latest.current);
      if (emptyDiff(d)) return;
      void fetch(`${supabaseUrl}/rest/v1/rpc/apply_board_changes`, {
        method: "POST",
        keepalive: true,
        headers: { apikey: supabaseKey, authorization: `Bearer ${token.current}`, "content-type": "application/json" },
        body: JSON.stringify({ p_board: boardId, p_changes: toWire(d, latest.current) }),
      }).catch(() => {});
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") save();
    };
    const online = () => void flush();
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("online", online);

    return () => {
      auth.data.subscription.unsubscribe();
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("online", online);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [boardId, live, receive, resync, flush]);

  return { status, here };
}
