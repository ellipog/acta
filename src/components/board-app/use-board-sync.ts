"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { roadmapChanged } from "@/lib/actions";
import { rememberBoard } from "@/lib/board-cache";
import {
  boardState,
  countShelves,
  fetchBoard,
  FIRST,
  PAGE,
  readCounts,
  readShelf,
  readTasks,
  readThread,
  taskFrom,
  type FirstRead,
  type NestedTask,
} from "@/lib/board-load";
import { shelfList, shelfOf, type Place, type Shelf } from "@/lib/board-shelves";
import { defaultPage, type Activity, type BoardState, type Task } from "@/lib/board-store";
import { revert, saveChanges } from "@/lib/board-save";
import {
  absorb,
  activityFrom,
  apply,
  diffBoards,
  heldBy,
  keepOwn,
  SentLog,
  emptyDiff,
  renumber,
  resolve,
  taskKey,
  taskNumber,
  toWire,
  unsure,
  type ActivityRow,
  type BoardRow,
  type Change as BoardChange,
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
import type { Catch, DemoAction } from "./demo-state";

// What a change from someone else does to the boards undo and redo go back to. The undo history keeps these until
// it needs them, so each is made out here, where it holds on to its change and nothing else from around it
const replay = (change: BoardChange): Catch => (b) => apply(b, change);
const rename = (from: string, to: string): Catch => (b) => renumber(b, from, to);

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

// Visitors share a cached copy of each public roadmap. A save that publishes or unpublishes it, edits its page,
// or takes a task off it asks the server to drop that copy, once things settle
const roadmapPings = new Map<string, ReturnType<typeof setTimeout>>();
function pingRoadmap(board: string) {
  clearTimeout(roadmapPings.get(board));
  roadmapPings.set(
    board,
    setTimeout(() => {
      roadmapPings.delete(board);
      void roadmapChanged(board).catch(() => {});
    }, 1000),
  );
}

export type SaveStatus = "saved" | "saving" | "offline" | "error";
export type Visitor = { id: string; name: string; avatar: string | null; tone: string };

// Changes newer than this before a snapshot are read again when catching up, in case clocks drift
const MARGIN = 60_000;
// A deleted comment or activity line leaves a trace for a day (see removed_lines). A board away for longer than this
// is read again instead of caught up, as a deletion could have been missed
const TRACE = 12 * 3_600_000;
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

type Handlers = {
  receive: (ev: RemoteEvent) => void;
  resync: () => Promise<void>;
  catchUp: (since: number) => Promise<void>;
  flush: () => Promise<void>;
  remember: () => void;
  recount: () => Promise<void>;
  recountShelves: () => Promise<void>;
  pump: () => void;
  loadLoose: () => Promise<void>;
};
const idle = async () => {};

// Tasks a live line or comment needs that the board hasn't read, for its Inbox, read together a moment later. Only
// the newest few matter there
const LOOSE = 40;
// A task number held by a request, in chunks short enough for an address
const CHUNK = 150;

const placeOf = (row: NestedTask) => ({ position: row.position, number: row.number });

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
  // Moves on with each save, so a read that a save overtook knows it may be out of date
  const saves = useRef(0);
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
  // Moves with every comment and activity line that comes in, so a read of counts can tell it may be out of date
  const threadEvents = useRef(0);
  // Threads being read, so opening a task twice reads it once
  const reading = useRef(new Set<string>());
  // Comments this tab deleted lately, whose deletion is about to come back over the live feed
  const dropped = useRef(new Set<string>());
  // Tasks whose counts and latest activity are to be read again, or null for every partial task
  const recounting = useRef<Set<number> | null | undefined>(undefined);
  const recountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Task numbers deleted lately, here or by someone else. A page of a shelf read before a deletion landed still has
  // the task, and mustn't bring it back
  const gone = useRef(new Set<number>());
  // The shelves the view shows, each read on to its end, and the ones being read now
  const wanted = useRef<Shelf[]>([]);
  const running = useRef(new Set<Shelf>());
  const [loading, setLoading] = useState<ReadonlySet<Shelf>>(() => new Set());
  // Shelves that couldn't be read, and when they gave up, so they wait a while before trying again
  const resting = useRef(new Map<Shelf, number>());
  // Moves on each time the board is read again whole, so reads begun before then stop
  const generation = useRef(0);
  const resyncing = useRef(false);
  // Moves with every task that comes in, so a count of the shelves can tell it may be out of date
  const taskEvents = useRef(0);
  const shelfTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tasks the Inbox needs that the board hasn't read
  const loose = useRef(new Set<number>());
  const looseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  // The newest callbacks, for timers and the long-lived subscription
  const handlers = useRef<Handlers>({
    receive: () => {},
    resync: idle,
    catchUp: idle,
    flush: idle,
    remember: () => {},
    recount: idle,
    recountShelves: idle,
    pump: () => {},
    loadLoose: idle,
  });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

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

  const names = useMemo(() => new Map((live?.members ?? []).map((m) => [m.id, m.name])), [live?.members]);
  // Threads read here name people the way the board's own load does
  const readName = useCallback((id: string | null) => (id && names.get(id)) || "Former member", [names]);

  const ctx = useMemo<Context>(() => {
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
  }, [names, prefix]);

  // Counts and latest activity lines of partial tasks are read again a moment after something they can't work out
  // for themselves, all at once. Without numbers, every partial task's are
  const recountLater = useCallback((numbers?: number[]) => {
    const now = recounting.current;
    recounting.current = !numbers || now === null ? null : new Set([...(now ?? []), ...numbers]);
    if (recountTimer.current) clearTimeout(recountTimer.current);
    recountTimer.current = setTimeout(() => void handlers.current.recount(), 400);
  }, []);

  // The shelves' counts are read again a moment after a change to a task this copy hadn't read, which could have
  // come from any of them
  const recountShelvesLater = useCallback(() => {
    if (shelfTimer.current) clearTimeout(shelfTimer.current);
    shelfTimer.current = setTimeout(() => void handlers.current.recountShelves(), 600);
  }, []);

  // A task the Inbox needs, read with any others a moment later
  const looseLater = useCallback((n: number) => {
    loose.current.add(n);
    if (looseTimer.current) return;
    looseTimer.current = setTimeout(() => {
      looseTimer.current = null;
      void handlers.current.loadLoose();
    }, 500);
  }, []);

  // Someone else's change, applied to what's saved and to what's on screen. A card someone moved comes with its new
  // position and goes where that says, among the cards here, so a move is one change however long the column
  const receive = useCallback(
    (ev: RemoteEvent) => {
      if (!base.current) return;
      if (ev.table === "comments" || ev.table === "activity") threadEvents.current++;
      if (ev.table === "tasks") {
        taskEvents.current++;
        if (ev.row.deleted_at) gone.current.add(ev.row.number);
        else gone.current.delete(ev.row.number);
      }
      if (inflight.current) {
        queue.current.push(ev);
        return;
      }
      const before = base.current;
      const number = ev.table === "tasks" ? ev.row.number : ev.table === "suggestions" || ev.table === "boards" ? null : ev.row?.number;
      const unread = before.gaps && number != null && !before.tasks[taskKey(prefix, number)];
      // A task this copy hadn't read came off some shelf, which has one fewer on the server now. A new one didn't
      if (unread && ev.table === "tasks" && !ev.fresh) recountShelvesLater();
      // A line or a comment on a task the board hasn't read is news for the Inbox, which needs the task
      if (unread && ev.table !== "tasks") looseLater(number);
      const change = sent.current.screen(resolve(before, ev, ctx));
      if (change.kind === "none") return;
      if (change.kind === "task" && change.add && latest.current.tasks[change.id] && !before.tasks[change.id]) {
        const from = change.id;
        const to = taskKey(prefix, Math.max(latest.current.next, Number(from.split("-").pop()) + 1));
        dispatch({ type: "rebase", current: (b) => renumber(b, from, to), history: rename(from, to) });
      }
      base.current = apply(before, change);
      dispatch({ type: "rebase", current: (b) => apply(b, change, before), history: replay(change) });
      // A comment this tab took back comes back as a deletion no thread holds any more, which isn't news
      if (change.kind === "uncomment" && dropped.current.delete(change.id)) return;
      const recount = unsure(before, base.current, change);
      if (recount) recountLater(recount === "all" ? undefined : recount);
    },
    [ctx, dispatch, prefix, recountLater, recountShelvesLater, looseLater],
  );

  // Tasks read from the server join what's saved, what's on screen and every step of undo at once, so no copy of the
  // board is left without them. A task already held stays as it is, as it's as new as anything a read can bring. at
  // is the shelf the read was of, and how far down it came
  const hold = useCallback(
    (rows: NestedTask[], at?: { shelf: Shelf; through?: Place; whole: boolean }) => {
      const before = base.current;
      if (!before) return;
      const tasks: Task[] = rows
        .filter((r) => !gone.current.has(r.number) && !before.tasks[taskKey(prefix, r.number)])
        .map((r) => taskFrom(prefix, r, readName));
      // A task made here that hasn't saved yet can have the number of one someone else just made. Ours moves on
      let free = tasks.reduce((n, t) => Math.max(n, taskNumber(t.id) + 1), Math.max(latest.current.next, before.next));
      for (const t of tasks)
        if (latest.current.tasks[t.id]) {
          const to = taskKey(prefix, free++);
          dispatch({ type: "rebase", current: (b) => renumber(b, t.id, to), history: rename(t.id, to) });
        }
      const change: BoardChange = { kind: "held", tasks, ...at };
      base.current = apply(before, change);
      dispatch({ type: "rebase", current: (b) => apply(b, change), history: replay(change) });
    },
    [dispatch, prefix, readName],
  );

  // Reads on down a shelf from where it got to, a page at a time, each showing as it lands. pages is how many, for
  // reading ahead of a shelf being shown. Trouble reaching the database is tried again after a pause, longer each time
  const readOn = useCallback(
    async (shelf: Shelf, pages = Infinity) => {
      if (!boardId || !meId || running.current.has(shelf) || !base.current?.gaps?.[shelf]) return;
      running.current.add(shelf);
      setLoading((now) => new Set(now).add(shelf));
      const gen = generation.current;
      try {
        const supabase = await loadClient();
        for (let page = 0, tries = 0; page < pages && alive.current; ) {
          const gap = base.current?.gaps?.[shelf];
          if (!gap || generation.current !== gen) return;
          const size = gap.through ? PAGE : FIRST;
          const rows = await readShelf(supabase, boardId, meId, shelf, gap.through, size);
          if (generation.current !== gen || !alive.current) return;
          if (!rows) {
            if (++tries >= 5) {
              resting.current.set(shelf, Date.now());
              return;
            }
            await pause(1000 * 2 ** tries);
            continue;
          }
          tries = 0;
          // A save going out can hold some of these tasks, and its answer says which
          while (inflight.current && alive.current) await pause(100);
          if (generation.current !== gen) return;
          const whole = rows.length < size;
          hold(rows, { shelf, through: rows.length ? placeOf(rows[rows.length - 1]) : gap.through, whole });
          if (whole) return;
          page++;
        }
      } finally {
        running.current.delete(shelf);
        setLoading((now) => {
          const next = new Set(now);
          next.delete(shelf);
          return next;
        });
        // What the view shows may have moved on meanwhile, or the board been read again
        setTimeout(() => handlers.current.pump(), 0);
      }
    },
    [boardId, meId, hold],
  );

  // Starts reading each shelf the view shows that isn't held whole and isn't being read already
  const pump = useCallback(() => {
    const gaps = base.current?.gaps;
    if (!alive.current || resyncing.current || !gaps) return;
    for (const s of wanted.current) {
      if (!gaps[s] || running.current.has(s)) continue;
      const gaveUp = resting.current.get(s);
      if (gaveUp && Date.now() - gaveUp < 30_000) {
        setTimeout(() => handlers.current.pump(), 30_000 - (Date.now() - gaveUp));
        continue;
      }
      resting.current.delete(s);
      void readOn(s);
    }
  }, [readOn]);

  /** The shelves the view shows. Each is read on to its end, its first page straight away */
  const want = useCallback(
    (shelves: Shelf[]) => {
      wanted.current = shelves;
      pump();
    },
    [pump],
  );

  /** Reads the first page of shelves the view is about to show, as when the pointer comes to what shows them, so they
   * show at once when it's pressed */
  const preload = useCallback(
    (shelves: Shelf[]) => {
      const gaps = base.current?.gaps;
      for (const s of shelves) if (gaps?.[s] && !gaps[s]!.through) void readOn(s, 1);
    },
    [readOn],
  );

  /** Reads tasks the board doesn't hold, by number, like one a link opens or one the Inbox needs. Resolves once
   * they're in, or once they can't be read */
  const loadTasks = useCallback(
    async (numbers: number[]) => {
      if (!boardId || !meId) return;
      const supabase = await loadClient();
      for (let tries = 0; tries < 3 && alive.current; tries++) {
        const missing = [...new Set(numbers)].filter((n) => !base.current?.tasks[taskKey(prefix, n)]);
        if (!missing.length) return;
        const reads = [];
        for (let i = 0; i < missing.length; i += CHUNK)
          reads.push(readTasks(supabase, boardId, meId, missing.slice(i, i + CHUNK)));
        const got = await Promise.all(reads);
        if (got.some((r) => !r)) {
          await pause(1000 * 2 ** tries);
          continue;
        }
        while (inflight.current && alive.current) await pause(100);
        hold(got.flatMap((r) => r!));
        return;
      }
    },
    [boardId, meId, prefix, hold],
  );

  const loadLoose = useCallback(async () => {
    const numbers = [...loose.current].slice(-LOOSE);
    loose.current.clear();
    await loadTasks(numbers);
  }, [loadTasks]);

  // Reads how many tasks each shelf has again. What the server has that isn't held here is a shelf's rest. A save or
  // a task coming in meanwhile could put the two out of step, so either reads it again
  const recountShelves = useCallback(async () => {
    if (!boardId || !base.current?.gaps) return;
    const supabase = await loadClient();
    for (let tries = 0; tries < 5 && alive.current; tries++) {
      if (inflight.current) {
        await pause(300);
        continue;
      }
      const seen = taskEvents.current;
      const saved = saves.current;
      const counts = await countShelves(supabase, boardId);
      if (!counts) return;
      if (inflight.current || saves.current !== saved || taskEvents.current !== seen) {
        await pause(300);
        continue;
      }
      const at = base.current;
      if (!at?.gaps) return;
      const held = new Map<Shelf, number>();
      for (const t of Object.values(at.tasks)) held.set(shelfOf(t), (held.get(shelfOf(t)) ?? 0) + 1);
      const gaps = Object.fromEntries(
        (Object.keys(at.gaps) as Shelf[]).map((s) => [
          s,
          { rest: (counts[s]?.count ?? 0) - (held.get(s) ?? 0), tail: counts[s]?.tail ?? undefined },
        ]),
      );
      const change: BoardChange = { kind: "gaps", gaps };
      base.current = apply(at, change);
      dispatch({ type: "rebase", current: (b) => apply(b, change), history: replay(change) });
      return;
    }
  }, [boardId, dispatch]);

  // The board read again: each shelf held whole is read whole again, and of the others the tasks held, so nothing
  // on screen goes missing. Where those shelves had got to in order can't be known any more, so the view's shelves
  // read on from their start again, passing over what's held
  const readAgain = useCallback(
    async (state: BoardState) => {
      if (!boardId || !meId) return null;
      const supabase = await loadClient();
      const whole = shelfList.filter((s) => !state.gaps?.[s]);
      const numbers = Object.values(state.tasks)
        .filter((t) => state.gaps?.[shelfOf(t)])
        .map((t) => taskNumber(t.id));
      const readAll = async (s: Shelf) => {
        const rows: NestedTask[] = [];
        for (let after: Place | undefined; ; ) {
          const page = await readShelf(supabase, boardId, meId, s, after, PAGE);
          if (!page) throw new Error(`The ${s} shelf couldn’t be read`);
          rows.push(...page);
          if (page.length < PAGE) return rows;
          after = placeOf(page[page.length - 1]);
        }
      };
      const chunks: number[][] = [];
      for (let i = 0; i < numbers.length; i += CHUNK) chunks.push(numbers.slice(i, i + CHUNK));
      const [fetched, shelves, held] = await Promise.all([
        fetchBoard(supabase, meId, boardId, []),
        Promise.all(whole.map(readAll)),
        Promise.all(
          chunks.map(async (c) => {
            const rows = await readTasks(supabase, boardId, meId, c);
            if (!rows) throw new Error("Tasks couldn’t be read");
            return rows;
          }),
        ),
      ]);
      if (!fetched) return null;
      const read: FirstRead["read"] = {};
      whole.forEach((s, i) => (read[s] = shelves[i].length));
      // In board order, as a read of the board brings its tasks
      const tasks = [...shelves.flat(), ...held.flat()].sort((a, b) => a.position - b.position || a.number - b.number);
      return boardState({ ...fetched.board, tasks }, readName, fetched.recent, {
        counts: fetched.first.counts,
        read,
        through: {},
        limit: Infinity,
      });
    },
    [boardId, meId, readName],
  );

  // Reads the board again, keeping changes that haven't saved yet. For after a dropped connection. Threads that were
  // read come back partial, and are read again when their dialog opens. Shelves being read stop, and carry on after
  const resync = useCallback(async () => {
    if (!boardId || inflight.current || resyncing.current || !base.current) return;
    const started = Date.now();
    resyncing.current = true;
    const gen = ++generation.current;
    try {
      const read = await readAgain(base.current).catch(() => null);
      if (!read || inflight.current || !base.current || generation.current !== gen) return;
      const before = base.current;
      const fresh = keepOwn(read, before);
      base.current = fresh;
      dispatch({ type: "rebase", current: (b) => absorb(fresh, b, diffBoards(before, b)), history: null });
      syncedAt.current = started;
      caughtUp.current = true;
    } finally {
      resyncing.current = false;
      handlers.current.pump();
    }
  }, [boardId, dispatch, readAgain]);

  // Reads a task's whole thread and newest activity, for its dialog. It lands in base, on screen and in every step
  // of undo at once, so no copy of the board is left without it
  const loadThread = useCallback(
    async (id: string) => {
      if (!boardId || reading.current.has(id)) return;
      reading.current.add(id);
      try {
        const supabase = await loadClient();
        for (let tries = 0; tries < 5; tries++) {
          if (inflight.current) {
            await pause(300);
            continue;
          }
          const task = base.current?.tasks[id];
          if (!task?.partial) return;
          const saved = saves.current;
          const had = heldBy(task);
          const read = await readThread(supabase, boardId, taskNumber(id), readName);
          if (!base.current) return;
          // Trouble reaching the database is tried again after a pause, longer each time
          if (!read) {
            await pause(1000 * 2 ** tries);
            continue;
          }
          // A save of ours went out meanwhile, so what was read may be out of date
          if (inflight.current || saves.current !== saved) continue;
          const change: BoardChange = { kind: "thread", task: id, ...read, had };
          base.current = apply(base.current, change);
          dispatch({ type: "rebase", current: (b) => apply(b, change), history: replay(change) });
          return;
        }
      } finally {
        reading.current.delete(id);
      }
    },
    [boardId, dispatch, readName],
  );

  // Reads comment counts and latest activity lines again for the partial tasks recountLater was told of. A count
  // can't tell which comments it has, so a comment that comes in or a save that goes out meanwhile reads it again
  const recount = useCallback(async () => {
    const which = recounting.current;
    recounting.current = undefined;
    if (!boardId || which === undefined) return;
    const supabase = await loadClient();
    for (let tries = 0; tries < 5; tries++) {
      if (inflight.current) {
        await pause(300);
        continue;
      }
      const at = base.current;
      if (!at) return;
      const ids = Object.values(at.tasks)
        .filter((t) => t.partial && (!which || which.has(taskNumber(t.id))))
        .map((t) => t.id);
      if (!ids.length) return;
      const seen = threadEvents.current;
      const saved = saves.current;
      const had = Object.fromEntries(ids.map((id) => [id, (at.tasks[id].thread ?? []).map((c) => c.id)]));
      // Every partial task's, by number while there are few enough to name
      const rows = await readCounts(supabase, boardId, which || ids.length <= CHUNK ? ids.map(taskNumber) : undefined);
      if (!rows || !base.current) return;
      if (inflight.current || saves.current !== saved || threadEvents.current !== seen) {
        await pause(300);
        continue;
      }
      const counts: Record<string, number> = {};
      const latest: Record<string, Activity> = {};
      for (const r of rows) {
        const id = taskKey(prefix, r.number);
        if (!(id in had)) continue;
        counts[id] = r.comments[0]?.count ?? 0;
        if (r.activity[0]) latest[id] = activityFrom(r.activity[0], readName);
      }
      const change: BoardChange = { kind: "counts", counts, latest, had };
      base.current = apply(base.current, change);
      dispatch({ type: "rebase", current: (b) => apply(b, change), history: replay(change) });
      return;
    }
  }, [boardId, dispatch, prefix, readName]);

  // Reads only what was saved after `since`, such as between the server reading the board and the live feed
  // starting, or while the board sat in the cache or out of sight. The margin allows for clocks that drift
  const catchUp = useCallback(
    async (since: number) => {
      if (!boardId) return;
      if (Date.now() - since > TRACE) return resync();
      const started = Date.now();
      const supabase = await loadClient();
      const after = new Date(since - MARGIN).toISOString();
      const [tasks, comments, activity, suggestions, row, removed, declined] = await Promise.all([
        supabase.from("tasks").select("*").eq("board_id", boardId).gt("updated_at", after),
        supabase.from("comments").select("*").eq("board_id", boardId).gt("created_at", after).order("created_at"),
        supabase.from("activity").select("*").eq("board_id", boardId).gt("created_at", after).order("created_at"),
        supabase.from("suggestions").select("*").eq("board_id", boardId).gt("created_at", after),
        supabase.from("boards").select("id, roadmap_public, page, next_number").eq("id", boardId).maybeSingle(),
        // Comments, activity and ideas are deleted outright. A deleted comment or line leaves its id behind for a
        // while, and a declined idea is kept with the declined ones. Both are missing until their migrations run
        supabase.from("removed_lines").select("id, number, kind").eq("board_id", boardId).gt("removed_at", after),
        supabase.from("declined_suggestions").select("id").eq("board_id", boardId).gt("declined_at", after),
      ]);
      for (const r of tasks.data ?? []) receive({ table: "tasks", row: r as TaskRow });
      // An idea someone accepted meanwhile is a task now
      for (const r of tasks.data ?? []) if (r.origin) receive({ table: "suggestions", old: { id: r.origin as string } });
      // Deletions go first, as a line an undo brought back since is among those read next
      for (const r of removed.data ?? [])
        receive({ table: r.kind === "comment" ? "comments" : "activity", old: { id: r.id, number: r.number } });
      for (const r of declined.data ?? []) receive({ table: "suggestions", old: { id: r.id } });
      for (const r of comments.data ?? []) receive({ table: "comments", row: r as CommentRow });
      for (const r of activity.data ?? []) receive({ table: "activity", row: r as ActivityRow });
      // Work an agent brings over keeps its old dates, so whatever changed on a task reads its threads again. A
      // partial task only reads its count and latest line again, and its dialog reads the rest
      const touched = [...new Set([...(tasks.data ?? []), ...(activity.data ?? [])].map((r) => r.number as number))];
      const partial = (n: number) => base.current?.tasks[taskKey(prefix, n)]?.partial;
      const whole = touched.filter((n) => base.current?.tasks[taskKey(prefix, n)] && !partial(n));
      if (whole.length) {
        const [older, olderActivity] = await Promise.all([
          supabase.from("comments").select("*").eq("board_id", boardId).in("number", whole).lte("created_at", after),
          supabase.from("activity").select("*").eq("board_id", boardId).in("number", whole).lte("created_at", after),
        ]);
        for (const r of older.data ?? []) receive({ table: "comments", row: r as CommentRow });
        for (const r of olderActivity.data ?? []) receive({ table: "activity", row: r as ActivityRow });
      }
      const counted = touched.filter(partial);
      if (counted.length) recountLater(counted);
      for (const r of suggestions.data ?? []) receive({ table: "suggestions", row: r as SuggestionRow });
      if (row.data) receive({ table: "boards", row: row.data as BoardRow });
      if (!tasks.error && !comments.error && !activity.error) {
        syncedAt.current = started;
        caughtUp.current = true;
      }
    },
    [boardId, prefix, receive, recountLater, resync],
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
      dispatch({ type: "rebase", current: (s) => renumber(s, a, b), history: rename(a, b) });
    for (const part of result.saved) {
      sent.current.record(part, result.goal);
      for (const u of part.uncomments) dropped.current.add(u.id);
      // A shelf read from before this save mustn't bring back what it deleted
      for (const id of part.deleted) gone.current.add(taskNumber(id));
      for (const id of part.created) gone.current.delete(taskNumber(id));
    }
    if (
      result.saved.some(
        (d) => d.comments.length || d.uncomments.length || d.updated.some((u) => u.fields.some((f) => githubFields.has(f))),
      )
    )
      pingGitHub(boardId);
    if (
      result.saved.some(
        (d) => d.roadmapPublic || d.page || d.deleted.length || d.updated.some((u) => u.fields.includes("public")),
      )
    )
      pingRoadmap(boardId);
    base.current = result.base;
    const saved = result.base;
    if (result.refused.length) {
      // Only what the database turned down comes off the board. Everything else was saved
      dispatch({ type: "rebase", current: (s) => result.refused.reduce((b, r) => revert(b, saved, r.diff), s) });
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
    handlers.current = { receive, resync, catchUp, flush, remember, recount, recountShelves, pump, loadLoose };
  });

  useEffect(() => {
    latest.current = board;
    if (!boardId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 250);
  }, [board, boardId, flush]);

  useEffect(
    () => () => {
      for (const t of [recountTimer, shelfTimer, looseTimer]) if (t.current) clearTimeout(t.current);
      looseTimer.current = null;
    },
    [],
  );

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
            if (p.new && "number" in p.new)
              receive({ table: "tasks", row: p.new as never, fresh: p.eventType === "INSERT" });
          } else if (table === "boards") {
            if (p.eventType !== "UPDATE") return;
            const next = p.new as { name?: string; labels?: unknown; projects?: unknown };
            const now = liveRef.current?.board;
            // The name, labels and projects come with the page, so a change to them reads the page again
            if (now && JSON.stringify([next.name, next.labels, next.projects]) !== JSON.stringify([now.name, now.labels, now.projects]))
              router.refresh();
            receive({ table: "boards", row: p.new as never });
          } else if (table === "comments")
            // A comment that arrives as it's made is one no count has yet
            receive({ table, row: row(p), old: p.old as never, fresh: p.eventType === "INSERT" });
          else receive({ table, row: row(p), old: p.old as never } as RemoteEvent);
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
          const next = [...seen.values()];
          // Presence syncs whenever anyone joins, leaves or tracks again. The same people keep the same list
          setHere((prev) =>
            prev.length === next.length &&
            prev.every((p, i) => p.id === next[i].id && p.name === next[i].name && p.avatar === next[i].avatar)
              ? prev
              : next,
          );
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

  return { status, here, knownAt, loadThread, want, preload, loadTasks, loading };
}
