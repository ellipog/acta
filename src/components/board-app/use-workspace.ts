"use client";

import { useEffect, useRef } from "react";
import { boardPath, cachedBoard, rememberBoard, rememberShell, setCounts } from "@/lib/board-cache";
import { boardQuery, boardState, countTasks, type NestedBoard } from "@/lib/board-load";
import type { LiveBoard } from "@/lib/live";
import { listen } from "@/lib/realtime";
import { loadClient } from "@/lib/supabase/browser";

// How many neighbouring boards load ahead of a click
const AHEAD = 6;

const hash = (text: string) => {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
};

/** The workspace around a live board: its frame for the loading screen, live task counts and boards loaded ahead */
export function useWorkspace(live: LiveBoard | undefined) {
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
    // A copy from the cache could be older than what's already known, so only the server's own is kept
    if (live && !("cachedAt" in live)) rememberShell(live);
  }, [live]);

  const workspaceId = live?.workspace.id;
  const ids = live?.boards.map((b) => b.id).join(",") ?? "";

  // Counts beside the other boards follow along: a task added, deleted or restored there reads them again
  useEffect(() => {
    if (!workspaceId || !ids) return;
    const list = ids.split(",");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => setCounts(await countTasks(await loadClient(), { ids: list })), 1000);
    };
    const stop = listen(`counts:${workspaceId}:${hash(ids)}`, [{ table: "tasks", filter: `board_id=in.(${ids})` }], {
      change: (_table, p) => {
        const row = (p.eventType === "DELETE" ? p.old : p.new) as { board_id?: string; deleted_at?: string | null };
        // The open board counts its own tasks
        if (row.board_id === liveRef.current?.board.id) return;
        if (p.eventType !== "UPDATE" || row.deleted_at) refresh();
      },
      joined: (again) => {
        if (again) refresh();
      },
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [workspaceId, ids]);

  // Boards next door load once the browser is idle, so the first click on one shows it at once
  const boardId = live?.board.id;
  useEffect(() => {
    const here = liveRef.current;
    if (!here || !boardId) return;
    const others = here.boards
      .filter((b) => b.id !== boardId && !cachedBoard(boardPath(here.workspace.slug, b.slug)))
      .slice(0, AHEAD);
    if (!others.length) return;
    let stopped = false;
    const run = async () => {
      const client = await loadClient();
      const names = new Map(here.members.map((m) => [m.id, m.name]));
      const nameOf = (id: string | null) => (id && names.get(id)) || "Former member";
      for (const b of others) {
        if (stopped) return;
        if (cachedBoard(boardPath(here.workspace.slug, b.slug))) continue;
        const started = Date.now();
        const { data } = await boardQuery(client, here.me.id).eq("id", b.id).maybeSingle();
        const nested = data as unknown as NestedBoard | null;
        if (!nested || stopped) continue;
        const state = boardState(nested, nameOf);
        rememberBoard(
          {
            ...here,
            board: {
              id: nested.id,
              slug: nested.slug,
              name: nested.name,
              prefix: nested.prefix,
              labels: nested.labels ?? [],
              projects: nested.projects ?? [],
            },
            state,
            at: started,
          },
          state,
          started,
        );
      }
    };
    const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 1500));
    const cancel = window.cancelIdleCallback ?? clearTimeout;
    const id = idle(() => void run(), { timeout: 5000 });
    return () => {
      stopped = true;
      cancel(id);
    };
  }, [boardId]);
}
