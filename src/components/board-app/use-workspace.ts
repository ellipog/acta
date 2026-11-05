"use client";

import { useEffect, useRef } from "react";
import { boardPath, peekBoard, rememberBoard, rememberShell, roomAhead, setCounts, setMine } from "@/lib/board-cache";
import { countTasks, fetchBoard, liveFrom } from "@/lib/board-load";
import type { LiveBoard } from "@/lib/live";
import { listen } from "@/lib/realtime";
import { loadClient } from "@/lib/supabase/browser";

// How many neighbouring boards load ahead of a click. Each is a board's tasks to download and convert, so only the
// nearest few
const AHEAD = 3;

// Loading ahead is a guess, so it's skipped for people saving data or on a slow connection
function slowNetwork() {
  const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(net?.saveData || (net?.effectiveType && /(^|-)2g$/.test(net.effectiveType)));
}

const hash = (text: string) => {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
};

// The workspace whose counts this page last followed
let followed: string | null = null;

/** The workspace around a live board: its frame for the loading screen, live task counts and boards loaded ahead */
export function useWorkspace(live: LiveBoard | undefined) {
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
    // A copy from the cache could be older than what's already known, so only the server's own is kept
    if (live && !("cachedAt" in live)) rememberShell(live);
  }, [live]);

  const workspaceId = live?.workspace.id;
  const boardId = live?.board.id;
  const ids = live?.boards.map((b) => b.id).join(",") ?? "";

  // Counts beside the other boards follow along: a task added, deleted or restored there reads them again. The open
  // board counts its own tasks from its own feed, so it's left out here and its changes don't arrive twice. Each
  // board open has its own set of the others to follow, and going back to a board within a few seconds finds its
  // feed still open
  useEffect(() => {
    if (!workspaceId || !ids || !boardId) return;
    const list = ids.split(",").filter((id) => id !== boardId);
    if (!list.length) return;
    // Nothing follows the counts between one board's feed closing and the next one's opening, so after moving
    // between boards they're read again once it's live. The first board on the page comes with fresh counts
    const moved = followed === workspaceId;
    followed = workspaceId;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Only the boards that changed are counted again, or every board after a dropped connection
    const touched = new Set<string>();
    const refresh = (board?: string) => {
      for (const id of board ? [board] : list) touched.add(id);
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const these = [...touched];
        touched.clear();
        const client = await loadClient();
        const me = liveRef.current?.me.id;
        const [all, yours] = await Promise.all([
          countTasks(client, { ids: these }),
          me ? countTasks(client, { ids: these }, me) : {},
        ]);
        setCounts(all);
        setMine(yours);
      }, 1000);
    };
    const others = list.join(",");
    const stop = listen(`counts:${workspaceId}:${hash(others)}`, [{ table: "tasks", filter: `board_id=in.(${others})` }], {
      change: (_table, p) => {
        const row = (p.eventType === "DELETE" ? p.old : p.new) as { board_id?: string };
        // Any change could be a task deleted, restored, archived or brought back, so that board's counts are read
        // again
        refresh(row.board_id && list.includes(row.board_id) ? row.board_id : undefined);
      },
      joined: (again) => {
        if (again || moved) refresh();
      },
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [workspaceId, boardId, ids]);

  // Boards next door load once the browser is idle, so the first click on one shows it at once
  useEffect(() => {
    const here = liveRef.current;
    if (!here || !boardId || slowNetwork()) return;
    // The boards either side of this one in the sidebar, nearest first
    const at = here.boards.findIndex((b) => b.id === boardId);
    const others = here.boards
      .map((b, i) => ({ b, d: Math.abs(i - at) + (i < at ? 0.5 : 0) }))
      .filter(({ b }) => b.id !== boardId && !peekBoard(boardPath(here.workspace.slug, b.slug)))
      .sort((x, y) => x.d - y.d)
      .slice(0, AHEAD)
      .map(({ b }) => b);
    if (!others.length || !roomAhead()) return;
    let stopped = false;
    const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 1500));
    const cancel = window.cancelIdleCallback ?? clearTimeout;
    let id = 0;
    // Waits for the browser to be idle again before each board, so converting one never lands on a click
    const pause = () =>
      new Promise<void>((done) => {
        id = idle(() => done(), { timeout: 5000 }) as unknown as number;
      });
    const run = async () => {
      const client = await loadClient();
      for (const [i, b] of others.entries()) {
        if (i) await pause();
        // Boards read ahead only fill free room in the cache, never push out ones that were looked at
        if (stopped || !roomAhead()) return;
        if (peekBoard(boardPath(here.workspace.slug, b.slug))) continue;
        const fetched = await fetchBoard(client, here.me.id, b.id).catch(() => null);
        if (!fetched || stopped) continue;
        // The answer can land in the middle of a click, so turning it into a board waits for idle again
        await pause();
        if (stopped) return;
        const read = liveFrom(here, fetched);
        rememberBoard(read, read.state, read.at, { ahead: true });
      }
    };
    id = idle(() => void run(), { timeout: 5000 }) as unknown as number;
    return () => {
      stopped = true;
      cancel(id);
    };
  }, [boardId]);
}
