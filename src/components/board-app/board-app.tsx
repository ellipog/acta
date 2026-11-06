"use client";

import Link from "next/link";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Dialog as D } from "radix-ui";
import { Icon, type IconName } from "@/components/ui/icons";
import { lazyPart } from "@/components/lazy-part";
import {
  closed,
  defaultStatusTitle,
  demoMeta,
  me,
  nextTaskId,
  people,
  boardMetaVersion,
  seedBoard,
  setBoardMeta,
  statusTitle,
  timeAgo,
  type BoardState,
  type StatusCategory,
  type Person,
  type Task,
} from "@/lib/board-store";
import { onPref, readPref, syncPrefs, writePref } from "@/lib/account-prefs";
import { rememberBoard, setCount, setMine } from "@/lib/board-cache";
import {
  boardTotal,
  shelfCounts,
  shelfList,
  shelvesShown,
  shows,
  statusShelves,
  totalOf,
  type Shelf,
  type ShelfCount,
} from "@/lib/board-shelves";
import type { ShelfInfo } from "./shelf-info";
import { settleEdits, useBoardEdits, withEdits } from "@/lib/board-edits";
import { can, metaFor, type LiveBoard, type Permission } from "@/lib/live";
import { authReady } from "@/lib/supabase/env";
import { AccountButton } from "@/components/account-button";
import { Avatar, AvatarStack, Spinner } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Badge, Kbd } from "@/components/ui/badge";
import { DitherFill } from "@/components/ui/dither";
import { DialogContent, SheetContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { ThemeControls } from "@/components/theme-toggle";
import { Wordmark } from "@/components/wordmark";
import { MyTasksLink, navItem, WorkspaceMenu } from "@/components/workspace-nav";
import { toast } from "@/components/ui/toast";
import { useNow } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { DitherName } from "@/lib/dither-assets";
import { demoReducer, initDemo, type DemoAction } from "./demo-state";
import {
  defaultColumns,
  metaOf,
  defaultPrefs,
  fieldIcon,
  fieldLabel,
  fieldOptions,
  filterFields,
  hasFilters,
  matches,
  sameFilters,
  tidyFilters,
  valueOf,
  type FilterField,
  type Filters,
  type Grouping,
  type Prefs,
  type View,
} from "./fields";
import { FieldsMenu } from "./fields-menu";
import { needs, refusal } from "./permissions";
import { BoardLinks, NewBoard } from "./board-nav";
import { useBoardSync, type SaveStatus, type Visitor } from "./use-board-sync";
import { useWorkspace } from "./use-workspace";

// Each view is its own download, and so is the task dialog. The rest arrive once the browser is idle, or straight
// away if someone opens one first. Each waits in its own spot, so opening one never blanks the board
const viewLoading = (
  <div className="late grid h-full place-items-center">
    <Spinner />
  </div>
);
const BoardView = lazyPart(() => import("./board-view").then((m) => m.BoardView), viewLoading);
const TableView = lazyPart(() => import("./table-view").then((m) => m.TableView), viewLoading);
const TimelineView = lazyPart(() => import("./timeline-view").then((m) => m.TimelineView), viewLoading);
const PublicRoadmap = lazyPart(() => import("./roadmap-view").then((m) => m.PublicRoadmap), viewLoading);
const TaskDialog = lazyPart(() => import("./task-dialog").then((m) => m.TaskDialog));

function preloadViews() {
  for (const part of [BoardView, TableView, TimelineView, PublicRoadmap, TaskDialog]) part.preload().catch(() => {});
}

const BOARD_KEY = "acta-demo-board-v5";
const PREFS_KEY = "acta-demo-prefs-v1";

const demoWorkspace: { name: string; sigil: DitherName; tone: "lapis" } = {
  name: "Ellipog Team",
  sigil: "crystal-cluster",
  tone: "lapis",
};

const demoBoard = "Portfolio site";

const views: { id: View; icon: IconName; label: string }[] = [
  { id: "table", icon: "table", label: "Table" },
  { id: "board", icon: "board", label: "Board" },
  { id: "roadmap", icon: "timeline", label: "Roadmap" },
  { id: "public", icon: "globe", label: "Public" },
];

const groupings: Grouping[] = ["status", "assignee", "priority", "size", "project"];

const tool = (on: boolean) =>
  cn(
    "flex h-8 shrink-0 items-center gap-1.5 border px-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lapis",
    on
      ? "border-lapis/40 bg-lapis-soft text-lapis-ink"
      : "border-line bg-raised text-ink-2 hover:border-line-strong hover:text-ink data-[state=open]:border-line-strong data-[state=open]:text-ink",
  );

const iconButton =
  "grid size-8 shrink-0 place-items-center text-ink-2 outline-none hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-lapis disabled:pointer-events-none disabled:opacity-35";

export function BoardApp({
  variant = "full",
  view = "board",
  className,
  live: incoming,
}: {
  variant?: "full" | "embed";
  view?: View;
  className?: string;
  live?: LiveBoard;
}) {
  const full = variant === "full";
  // Changes to boards that are still saving show straight away
  const edits = useBoardEdits();
  const live = useMemo(() => incoming && withEdits(incoming, edits), [incoming, edits]);
  useEffect(() => {
    if (incoming) settleEdits(incoming);
  }, [incoming, edits]);
  const meta = useMemo(() => (live ? metaFor(live) : demoMeta), [live]);
  setBoardMeta(meta);
  const metaVersion = boardMetaVersion();
  // Boards you left stay mounted out of sight for a while, and one could have set its own people and labels
  // since. Showing this one again puts its own back
  useLayoutEffect(() => setBoardMeta(meta));
  const [demo, rawDispatch] = useReducer(demoReducer, undefined, () =>
    initDemo(live ? live.state : seedBoard(), full ? {} : { view }),
  );
  const { board: state, prefs, restored, synced } = demo;
  const { status, here, knownAt, loadThread, want, preload, loadTasks, loading } = useBoardSync(
    live,
    state,
    rawDispatch,
  );
  useWorkspace(full ? live : undefined);
  const liveId = live?.board.id;
  // How many tasks each shelf has, counting those still on the server
  const counts = useMemo(() => shelfCounts(state), [state]);
  const { taskCount, mineCount } = useMemo(() => {
    let mine = 0;
    for (const t of Object.values(state.tasks))
      if (!t.archived && t.assignee === me.id && !closed(t.status)) mine++;
    // Yours can only be counted here once every open shelf is held whole
    const open = statusShelves.filter((s) => !closed(s));
    return { taskCount: boardTotal(counts), mineCount: open.some((s) => state.gaps?.[s]) ? undefined : mine };
  }, [state.tasks, state.gaps, counts]);
  useEffect(() => {
    if (liveId && taskCount !== undefined) setCount(liveId, taskCount);
  }, [liveId, taskCount]);
  useEffect(() => {
    if (liveId && mineCount !== undefined) setMine({ [liveId]: mineCount });
  }, [liveId, mineCount]);

  // The shelves of tasks this view shows are read, each to its end, and the rest stay on the server until it shows
  // them. Shelves whose size couldn't be counted are read too, as there's no telling what they hold. This waits for
  // the board's settings, so tasks the saved filters hide aren't read before they're known
  const shown = useMemo(
    () =>
      shelvesShown({
        view: prefs.view,
        grouping: prefs.grouping,
        collapsed: prefs.collapsed,
        filters: prefs.filters,
      }),
    [prefs.view, prefs.grouping, prefs.collapsed, prefs.filters],
  );
  const needKey = [...new Set([...shown, ...shelfList.filter((s) => state.gaps?.[s] && state.gaps[s]!.rest === undefined)])].join(",");
  useEffect(() => {
    if (live && (restored || !full)) want(needKey ? (needKey.split(",") as Shelf[]) : []);
  }, [live, restored, full, needKey, want]);
  // What a view would show, read ahead as the pointer comes to whatever switches to it
  const preloadView = useCallback(
    (patch: Partial<Prefs>) => {
      if (!live) return;
      const next = { ...prefs, ...patch };
      preload(shelvesShown({ view: next.view, grouping: next.grouping, collapsed: next.collapsed, filters: next.filters }));
    },
    [live, prefs, preload],
  );
  // A board's prefs follow the person signed in to their other devices. The demo's stay in this browser
  const prefsKey = live ? `prefs-${live.board.id}` : PREFS_KEY;
  const setPrefs = useCallback((patch: Partial<Prefs>) => rawDispatch({ type: "prefs", patch }), []);

  // What this person may change here. The demo is anyone's to change
  const role = live?.workspace.role;
  const permissions = live?.workspace.permissions;
  const allowed = useCallback((p: Permission) => !role || can(role, permissions, p), [role, permissions]);
  const refused = useRef(0);

  // One dispatch for the board's whole life. It reads the latest state through a ref, so the views and every
  // memoized row and card they hold aren't drawn again just because the board changed somewhere else
  const current = useRef({ state, depth: demo.past.length, allowed });
  useLayoutEffect(() => {
    current.current = { state, depth: demo.past.length, allowed };
  });
  const dispatch = useCallback(
    (action: DemoAction) => {
      const { state, depth, allowed } = current.current;
      const missing = needs(action, state).find((p) => !allowed(p));
      if (missing) {
        // Typing in a field sends a change with each key, so the reason shows once rather than with every one
        if (Date.now() - refused.current > 4000)
          toast({ icon: "lock", title: refusal[missing], description: "A workspace admin can change that." });
        refused.current = Date.now();
        return;
      }
      if (action.type === "bulk" && "archived" in action.patch) {
        const one = action.ids.length === 1;
        const on = Boolean(action.patch.archived);
        toast({
          icon: "archive",
          title: `${on ? "Archived" : "Unarchived"} ${one ? action.ids[0] : `${action.ids.length} tasks`}`,
          description: one ? state.tasks[action.ids[0]]?.title : on ? "Show archived in Filter finds them." : undefined,
          action: { label: "Undo", onClick: () => rawDispatch({ type: "undoTo", depth }) },
        });
      } else if (action.type === "delete" || action.type === "bulk") {
        const one = action.ids.length === 1;
        toast({
          icon: action.type === "delete" ? "trash" : "check",
          title:
            action.type === "delete"
              ? one
                ? `Deleted ${action.ids[0]}`
                : `Deleted ${action.ids.length} tasks`
              : `Updated ${action.ids.length} tasks`,
          description:
            action.type === "delete"
              ? one
                ? state.tasks[action.ids[0]]?.title
                : "Undo brings them all back."
              : action.note,
          action: { label: "Undo", onClick: () => rawDispatch({ type: "undoTo", depth }) },
        });
      }
      rawDispatch(action);
    },
    [],
  );

  const undo = useCallback(() => {
    const step = demo.past.at(-1);
    if (!step) return void toast({ icon: "undo", title: "Nothing to undo", duration: 1600 });
    rawDispatch({ type: "undo" });
    toast({ icon: "undo", title: "Undone", description: step.label, duration: 2400 });
  }, [demo.past]);

  const redo = useCallback(() => {
    const step = demo.future[0];
    if (!step) return void toast({ icon: "undo", title: "Nothing to redo", duration: 1600 });
    rawDispatch({ type: "redo" });
    toast({ icon: "undo", title: "Redone", description: step.label, duration: 2400 });
  }, [demo.future]);

  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Once per board. A fresh copy from the server mustn't put back what someone changed since
  const isLive = Boolean(live);
  useEffect(() => {
    if (!full) return;
    let board: BoardState | null = null;
    let saved: Partial<Prefs> | null = null;
    try {
      const b = isLive ? null : localStorage.getItem(BOARD_KEY);
      if (b) board = JSON.parse(b);
      if (isLive) saved = readPref<Partial<Prefs>>(prefsKey);
      else {
        const p = localStorage.getItem(prefsKey);
        if (p) saved = JSON.parse(p);
      }
    } catch {}
    rawDispatch({ type: "restore", board, prefs: saved });
  }, [full, isLive, prefsKey]);

  // Settings changed on another device arrive in the background. Filters someone is trying out here stay put
  const prefsNow = useRef(prefs);
  useLayoutEffect(() => {
    prefsNow.current = prefs;
  });
  const meId = live?.me.id;
  useEffect(() => {
    if (!full || !meId) return;
    syncPrefs(meId);
    return onPref(prefsKey, () => {
      const saved = readPref<Partial<Prefs>>(prefsKey);
      if (!saved) return;
      const { filters, keptFilters } = prefsNow.current;
      rawDispatch({ type: "restore", board: null, prefs: saved });
      if (!sameFilters(filters, keptFilters)) rawDispatch({ type: "prefs", patch: { filters } });
    });
  }, [full, meId, prefsKey]);

  useEffect(() => {
    if (!full || !restored || live) return;
    try {
      localStorage.setItem(BOARD_KEY, JSON.stringify(state));
    } catch {}
  }, [full, restored, state, live]);

  useEffect(() => {
    // Prefs just read back are already saved, and saving them again would send one device's defaults over the
    // settings the account already has
    if (!full || !restored || prefs === synced) return;
    const value = { ...prefs, filters: {} };
    if (isLive) return writePref(prefsKey, value);
    try {
      localStorage.setItem(prefsKey, JSON.stringify(value));
    } catch {}
  }, [full, restored, prefs, synced, prefsKey, isLive]);

  // A link to one of its tasks, like those on My tasks, opens it. The board may have been out of sight and is
  // only being shown again, so this runs each time it shows. The address loses the task once it's open, so
  // coming back later doesn't open it again
  const stateNow = useRef(state);
  useLayoutEffect(() => {
    stateNow.current = state;
  });
  // A task the board hasn't read, like a done one while done is hidden, is read first, and opens once it's in
  const prefixNow = live?.board.prefix;
  useEffect(() => {
    if (!full || !restored) return;
    let current = true;
    const open = (id: string) => {
      setOpenId(id);
      history.replaceState(history.state, "", location.pathname + location.search);
    };
    const fromLink = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id) return;
      if (stateNow.current.tasks[id]) return open(id);
      const n = Number(id.slice(id.lastIndexOf("-") + 1));
      if (!prefixNow || id !== `${prefixNow}-${n}` || !stateNow.current.gaps) return;
      void loadTasks([n]).then(() => {
        if (current && stateNow.current.tasks[id] && decodeURIComponent(location.hash.slice(1)) === id) open(id);
      });
    };
    fromLink();
    window.addEventListener("hashchange", fromLink);
    return () => {
      current = false;
      window.removeEventListener("hashchange", fromLink);
    };
  }, [full, restored, prefixNow, loadTasks]);

  // The dialog mounts the first time a task opens and then stays, so it can animate closed
  const [dialogUsed, setDialogUsed] = useState(false);
  if (openId && !dialogUsed) setDialogUsed(true);

  // The board holds only each task's comment count and latest activity, so an open task reads the rest. It reads
  // again if the board is read anew while it's open, as after a dropped connection
  const openPartial = Boolean(openId && state.tasks[openId]?.partial);
  useEffect(() => {
    if (openId && openPartial) void loadThread(openId);
  }, [openId, openPartial, loadThread]);

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 1500));
    const stop = window.cancelIdleCallback ?? clearTimeout;
    const id = idle(preloadViews);
    return () => stop(id);
  }, []);

  const lastPath = live ? `${live.workspace.slug}/${live.board.slug}` : null;
  useEffect(() => {
    if (lastPath) document.cookie = `acta-last=${lastPath}; path=/; max-age=31536000; samesite=lax`;
  }, [lastPath]);

  const canEdit = allowed("edit");
  const createTask = useCallback(() => {
    if (!canEdit)
      return void toast({ icon: "lock", title: refusal.edit, description: "A workspace admin can change that." });
    const id = nextTaskId(state);
    rawDispatch({ type: "add", status: "todo", title: "Untitled task" });
    setOpenId(id);
  }, [state, canEdit]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.closest("input, textarea, select, [contenteditable]");
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !typing && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && !typing && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod || e.altKey || typing || el.closest("[role=dialog], [role=menu], [role=listbox]")) return;
      const view = ({ "1": "table", "2": "board", "3": "roadmap", "4": "public" } as Record<string, View>)[e.key];
      if (e.key === "c") {
        e.preventDefault();
        createTask();
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
      } else if (view) setPrefs({ view });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full, createTask, undo, redo, setPrefs]);

  const filters = prefs.filters;
  // The box shows each key at once. The views filter on the deferred copy, so React can draw them between keys
  // instead of making typing wait on every card and row
  const searching = useDeferredValue(query);
  const found = useMemo(() => {
    const q = searching.trim().toLowerCase();
    return (t: Task) =>
      !q ||
      t.title.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      (t.project ?? "").toLowerCase().includes(q);
  }, [searching]);
  // A shelf still being read shows only as far as it's come in board order, so nothing shows out of place
  const gaps = state.gaps;
  const visible = useMemo(
    () => (t: Task) => found(t) && matches(t, filters) && shows(gaps, t),
    [found, filters, gaps],
  );
  // Archived work stays on the public roadmap, so its preview shows it too
  const onRoadmap = useMemo(
    () => (t: Task) => found(t) && matches(t, { ...filters, archived: true }) && shows(gaps, t),
    [found, filters, gaps],
  );

  // The task dialog steps through what the view shows, in board order
  const dialogOrder = useMemo(
    () =>
      dialogUsed
        ? Object.values(state.columns)
            .flat()
            .filter((id) => state.tasks[id] && visible(state.tasks[id]))
        : [],
    [dialogUsed, state.columns, state.tasks, visible],
  );

  const filterCount = Object.keys(tidyFilters(filters)).length;
  const filtered = Boolean(searching.trim()) || filterCount > 0;
  // Hiding done work or showing the archive keeps every count whole. Search and the other filters don't
  const narrowed = Boolean(searching.trim()) || filterFields.some((f) => filters[f]?.length);
  const { hideDone, status: onlyStatus } = filters;
  const shelfInfo = useMemo<ShelfInfo | undefined>(
    () =>
      live
        ? {
            counts,
            loading,
            narrowed,
            preload,
            allows: (s) =>
              s === "archived" ||
              (!(hideDone && closed(s)) && (!onlyStatus?.length || onlyStatus.includes(s))),
          }
        : undefined,
    [live, counts, loading, narrowed, preload, hideDone, onlyStatus],
  );
  const setFilter = (field: FilterField, values: string[]) => setPrefs({ filters: { ...filters, [field]: values } });
  const clearFilters = useCallback(() => {
    setQuery("");
    setPrefs({ filters: {} });
  }, [setPrefs]);

  // Filters are for the visit at hand unless someone saves them for the board
  const boardName = live ? live.board.name : demoBoard;
  const unsaved = !sameFilters(filters, prefs.keptFilters);
  const keepFilters = useCallback(
    (next: Filters, quiet = false) => {
      const kept = tidyFilters(next);
      setPrefs({ keptFilters: kept });
      // The board may already be out of sight, where its own saving waits until it's shown again
      if (isLive) writePref(prefsKey, { ...readPref<Partial<Prefs>>(prefsKey), keptFilters: kept });
      else
        try {
          const stored = JSON.parse(localStorage.getItem(prefsKey) ?? "{}");
          localStorage.setItem(prefsKey, JSON.stringify({ ...stored, keptFilters: kept }));
        } catch {}
      if (!quiet)
        toast({
          icon: hasFilters(kept) ? "filter" : "x",
          title: hasFilters(kept) ? "Filters saved" : "Saved filters forgotten",
          description: hasFilters(kept) ? `${boardName} opens with them from now on.` : `${boardName} opens unfiltered.`,
          duration: 2400,
        });
    },
    [setPrefs, prefsKey, boardName, isLive],
  );

  // Leaving with unsaved filters asks once whether to keep them
  const leaving = useRef({ filters, kept: prefs.keptFilters, keepFilters, boardName, restored });
  useEffect(() => {
    leaving.current = { filters, kept: prefs.keptFilters, keepFilters, boardName, restored };
  });
  const asked = useRef("");
  useEffect(() => {
    if (!full) return;
    return () => {
      const { filters, kept, keepFilters, boardName, restored } = leaving.current;
      const key = JSON.stringify(tidyFilters(filters));
      if (!restored || sameFilters(filters, kept) || asked.current === key) return;
      asked.current = key;
      const keeping = hasFilters(filters);
      toast({
        icon: "filter",
        title: keeping ? `Keep your filters on ${boardName}?` : `Open ${boardName} unfiltered next time?`,
        description: keeping ? "Saved filters come back when you return." : "Its saved filters are still on.",
        action: { label: keeping ? "Save" : "Forget", onClick: () => keepFilters(filters, false) },
        duration: 8000,
      });
    };
  }, [full]);

  const sidebar = (
    <Sidebar
      full={full}
      live={live}
      state={state}
      counts={counts}
      prefs={prefs}
      setPrefs={setPrefs}
      onOpenTask={(id) => {
        setNavOpen(false);
        setOpenId(id);
      }}
      onNavigate={() => setNavOpen(false)}
      keep={() => {
        if (live) rememberBoard(live, state, knownAt());
      }}
      onReset={() => {
        dispatch({ type: "reset", state: seedBoard() });
        setPrefs({ ...defaultPrefs, view: prefs.view });
        setQuery("");
        setOpenId(null);
      }}
    />
  );

  const showChips = filterCount > 0 || (prefs.view === "table" && prefs.sort);
  const chip = "flex h-6 shrink-0 items-center border border-line-strong bg-raised text-xs";
  const chipClose =
    "ml-1 grid h-full w-6 place-items-center border-l border-line text-ink-3 hover:bg-sunken hover:text-ink";

  return (
    <TooltipProvider>
      <div
        className={cn(
          "flex overflow-hidden bg-page text-left text-ink",
          full ? "h-dvh" : "h-[36rem] border border-line-strong",
          className,
        )}
      >
        <aside
          className={cn("hidden w-60 shrink-0 flex-col border-r border-line bg-surface", full ? "md:flex" : "lg:flex")}
        >
          {sidebar}
        </aside>

        <div className="@container flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-surface px-2 sm:px-4">
            {full ? (
              <D.Root open={navOpen} onOpenChange={setNavOpen}>
                <D.Trigger aria-label="Open navigation" className={cn(iconButton, "md:hidden")}>
                  <Icon name="menu" />
                </D.Trigger>
                <SheetContent title="Navigation">{sidebar}</SheetContent>
              </D.Root>
            ) : null}
            <div className="flex min-w-0 items-center gap-2.5">
              <h2 className="truncate font-display text-lg leading-none">{live ? live.board.name : demoBoard}</h2>
              {live && canEdit ? <SaveState status={status} /> : null}
              {canEdit ? null : (
                <Tooltip content="You can comment and vote. A workspace admin can let you change tasks">
                  <span className="flex h-6 shrink-0 items-center gap-1.5 border border-line px-1.5 text-[11px] text-ink-3">
                    <Icon name="eye" size="sm" /> View only
                  </span>
                </Tooltip>
              )}
              {state.roadmap.public ? (
                <Tooltip content="The roadmap is public">
                  <button
                    onClick={() => setPrefs({ view: "public" })}
                    className="hidden h-6 shrink-0 items-center gap-1.5 border border-lapis/30 bg-lapis-soft px-1.5 text-[11px] text-lapis-ink hover:border-lapis sm:flex"
                  >
                    <Icon name="globe" size="sm" /> Public
                  </button>
                </Tooltip>
              ) : null}
            </div>

            <div className="ml-auto flex items-center gap-1">
              <Presence visitors={live ? here : undefined} />
              <Tooltip
                content={
                  <span>
                    Undo <Kbd className="ml-1 border-ink-3 bg-transparent text-page">⌘Z</Kbd>
                  </span>
                }
              >
                <button
                  aria-label="Undo"
                  onClick={undo}
                  disabled={!demo.past.length}
                  className={cn(iconButton, "hidden sm:grid")}
                >
                  <Icon name="undo" />
                </button>
              </Tooltip>
              <Tooltip
                content={
                  <span>
                    Redo <Kbd className="ml-1 border-ink-3 bg-transparent text-page">⇧⌘Z</Kbd>
                  </span>
                }
              >
                <button
                  aria-label="Redo"
                  onClick={redo}
                  disabled={!demo.future.length}
                  className={cn(iconButton, "hidden sm:grid")}
                >
                  <Icon name="undo" className="-scale-x-100" />
                </button>
              </Tooltip>
              {full ? (
                <Tooltip
                  content={
                    <span>
                      Shortcuts <Kbd className="ml-1 border-ink-3 bg-transparent text-page">?</Kbd>
                    </span>
                  }
                >
                  <button
                    aria-label="Keyboard shortcuts"
                    onClick={() => setHelp(true)}
                    className={cn(iconButton, "hidden md:grid")}
                  >
                    <Icon name="keyboard" />
                  </button>
                </Tooltip>
              ) : null}
              {canEdit ? (
                <Button variant="primary" size="sm" onClick={createTask} className="ml-1">
                  <Icon name="plus" /> <span className="hidden sm:inline">New task</span>
                  {full ? (
                    <Kbd className="ml-1 hidden border-on-accent/40 bg-transparent text-on-accent sm:inline-flex">C</Kbd>
                  ) : null}
                </Button>
              ) : null}
            </div>
          </header>

          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface pr-2 sm:pr-4">
            <div role="tablist" aria-label="Views" className="flex h-full shrink-0 items-center pl-1 sm:pl-2">
              {views.map((v, i) => (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={prefs.view === v.id}
                  aria-label={v.label}
                  onPointerEnter={() => preloadView({ view: v.id })}
                  onFocus={() => preloadView({ view: v.id })}
                  onClick={() => setPrefs({ view: v.id })}
                  className={cn(
                    "group/tab -mb-px flex h-full items-center gap-1.5 border-b-2 px-2.5 text-sm outline-none focus-visible:bg-sunken",
                    prefs.view === v.id ? "border-lapis text-ink" : "border-transparent text-ink-2 hover:text-ink",
                  )}
                >
                  <Icon name={v.icon} size="sm" />
                  <span className="hidden @3xl:inline">{v.label}</span>
                  {full ? (
                    <span className="hidden font-mono text-[10px] text-ink-3 opacity-0 group-hover/tab:opacity-100 @5xl:inline">
                      {i + 1}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="-mr-2 ml-auto flex min-w-0 items-center gap-1.5 overflow-x-auto py-1 pr-2 sm:-mr-4 sm:pr-4">
              <label className="flex h-8 shrink-0 items-center gap-2 border border-line bg-raised px-2 focus-within:border-lapis">
                <Icon name="search" size="sm" className="text-ink-3" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setQuery("");
                      e.currentTarget.blur();
                    }
                  }}
                  placeholder="Search"
                  aria-label="Search tasks"
                  className="w-20 bg-transparent text-sm outline-none placeholder:text-ink-3 @xl:w-28 @5xl:w-40"
                />
                {query ? (
                  <button aria-label="Clear search" onClick={() => setQuery("")} className="text-ink-3 hover:text-ink">
                    <Icon name="x" size="sm" />
                  </button>
                ) : full ? (
                  <Kbd className="hidden @xl:inline-flex">/</Kbd>
                ) : null}
              </label>
              <FilterMenu
                state={state}
                counts={live ? counts : undefined}
                preload={(patch) => preloadView({ filters: { ...filters, ...patch } })}
                filters={filters}
                setFilter={setFilter}
                setFilters={(patch) => setPrefs({ filters: { ...filters, ...patch } })}
                count={filterCount}
                onClear={() => setPrefs({ filters: {} })}
                unsaved={unsaved}
                kept={hasFilters(prefs.keptFilters)}
                onSave={() => keepFilters(filters)}
                onForget={() => keepFilters({})}
              />
              {prefs.view === "table" || prefs.view === "roadmap" ? (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger className={tool(prefs.grouping !== "none")}>
                      <Icon name="group" size="sm" />
                      <span className="hidden @2xl:inline">
                        {prefs.grouping === "none" ? "Group" : fieldLabel[prefs.grouping]}
                      </span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Group rows by</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={prefs.grouping}
                        onValueChange={(v) => setPrefs({ grouping: v as Grouping })}
                      >
                        {groupings.map((g) => (
                          <DropdownMenuRadioItem key={g} value={g}>
                            <Icon name={fieldIcon[g as Exclude<Grouping, "none">]} />{" "}
                            {fieldLabel[g as Exclude<Grouping, "none">]}
                          </DropdownMenuRadioItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioItem value="none">
                          <Icon name="list" /> No grouping
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {prefs.view === "table" ? (
                    <FieldsMenu
                      prefs={prefs}
                      setPrefs={setPrefs}
                      trigger={
                        <button className={tool(prefs.columns.some((c) => c.hidden && defaultColumns.some((d) => d.id === c.id && !d.hidden)))}>
                          <Icon name="columns" size="sm" />
                          <span className="hidden @2xl:inline">Fields</span>
                        </button>
                      }
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          {showChips ? (
            <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line bg-surface px-2 py-1.5 sm:px-4">
              {filters.hideDone ? (
                <span className={chip}>
                  <Icon name="eye-off" size="sm" className="ml-2 text-ink-3" />
                  <span className="ml-1.5">Done hidden</span>
                  <button
                    aria-label="Show done tasks"
                    onPointerEnter={() => preloadView({ filters: { ...filters, hideDone: false } })}
                    onFocus={() => preloadView({ filters: { ...filters, hideDone: false } })}
                    onClick={() => setPrefs({ filters: { ...filters, hideDone: false } })}
                    className={chipClose}
                  >
                    <Icon name="x" size="sm" />
                  </button>
                </span>
              ) : null}
              {filters.archived ? (
                <span className={chip}>
                  <Icon name="archive" size="sm" className="ml-2 text-ink-3" />
                  <span className="ml-1.5">Showing archived</span>
                  <button
                    aria-label="Hide archived tasks"
                    onClick={() => setPrefs({ filters: { ...filters, archived: false } })}
                    className={chipClose}
                  >
                    <Icon name="x" size="sm" />
                  </button>
                </span>
              ) : null}
              {filterFields
                .filter((f) => filters[f]?.length)
                .map((f) => (
                  <span key={f} className="flex h-6 shrink-0 items-center border border-line-strong bg-raised text-xs">
                    <Icon name={fieldIcon[f]} size="sm" className="ml-2 text-ink-3" />
                    <span className="ml-1.5 text-ink-3">{fieldLabel[f]}</span>
                    <span className="ml-1.5 max-w-48 truncate">
                      {filters[f]!.map((v) => fieldOptions[f].find((o) => o.value === v)?.label ?? v).join(", ")}
                    </span>
                    <button
                      aria-label={`Remove the ${fieldLabel[f].toLowerCase()} filter`}
                      onClick={() => setFilter(f, [])}
                      className="ml-1 grid h-full w-6 place-items-center border-l border-line text-ink-3 hover:bg-sunken hover:text-ink"
                    >
                      <Icon name="x" size="sm" />
                    </button>
                  </span>
                ))}
              {prefs.view === "table" && prefs.sort ? (
                <span className="flex h-6 shrink-0 items-center border border-line-strong bg-raised text-xs">
                  <Icon name="sort" size="sm" className="ml-2 text-ink-3" />
                  <span className="ml-1.5 text-ink-3">Sorted by</span>
                  <span className="ml-1.5">{prefs.sort.key === "id" ? "ID" : metaOf(prefs.sort.key).label}</span>
                  <Icon name={prefs.sort.dir === 1 ? "arrow-up" : "arrow-down"} size="sm" className="ml-1 text-lapis" />
                  <button
                    aria-label="Clear sort"
                    onClick={() => setPrefs({ sort: null })}
                    className="ml-1.5 grid h-full w-6 place-items-center border-l border-line text-ink-3 hover:bg-sunken hover:text-ink"
                  >
                    <Icon name="x" size="sm" />
                  </button>
                </span>
              ) : null}
              {filterCount ? (
                <>
                  <button
                    onClick={() => setPrefs({ filters: {} })}
                    className="ml-1 shrink-0 text-xs text-ink-3 hover:text-ink"
                  >
                    Clear filters
                  </button>
                  {unsaved ? (
                    <Tooltip content={`Open ${boardName} with these filters from now on`}>
                      <button
                        onClick={() => keepFilters(filters)}
                        className="ml-auto flex h-6 shrink-0 items-center gap-1.5 border border-lapis/40 bg-lapis-soft px-2 text-xs text-lapis-ink hover:border-lapis"
                      >
                        <Icon name="check" size="sm" /> Save filters
                      </button>
                    </Tooltip>
                  ) : (
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-ink-3">
                      <Icon name="check" size="sm" /> Saved
                    </span>
                  )}
                </>
              ) : null}
            </div>
          ) : null}

          <main className="min-h-0 flex-1">
            {prefs.view === "table" ? (
              <TableView
                state={state}
                dispatch={dispatch}
                visible={visible}
                onOpen={setOpenId}
                prefs={prefs}
                setPrefs={setPrefs}
                filtered={filtered}
                onClearFilters={clearFilters}
                metaVersion={metaVersion}
                shelves={shelfInfo}
              />
            ) : prefs.view === "board" ? (
              <BoardView
                state={state}
                dispatch={dispatch}
                visible={visible}
                onOpen={setOpenId}
                prefs={prefs}
                setPrefs={setPrefs}
                metaVersion={metaVersion}
                shelves={shelfInfo}
              />
            ) : prefs.view === "roadmap" ? (
              <TimelineView
                state={state}
                dispatch={dispatch}
                visible={visible}
                onOpen={setOpenId}
                prefs={prefs}
                setPrefs={setPrefs}
                filtered={filtered}
                onClearFilters={clearFilters}
                metaVersion={metaVersion}
                shelves={shelfInfo}
              />
            ) : (
              <PublicRoadmap
                state={state}
                dispatch={dispatch}
                visible={onRoadmap}
                onOpen={setOpenId}
                boardId={liveId}
                canManage={allowed("roadmap")}
                metaVersion={metaVersion}
              />
            )}
          </main>
        </div>

        {dialogUsed ? (
          <TaskDialog
            task={openId ? (state.tasks[openId] ?? null) : null}
            dispatch={dispatch}
            onClose={() => setOpenId(null)}
            order={dialogOrder}
            onOpen={setOpenId}
            canEdit={canEdit}
          />
        ) : null}
        {full ? <Shortcuts open={help} onOpenChange={setHelp} /> : null}
      </div>
    </TooltipProvider>
  );
}

function Presence({ visitors }: { visitors?: Visitor[] }) {
  const here = visitors
    ? visitors.map((v) => ({ id: v.id, name: v.name, avatar: v.avatar, tone: v.tone as Person["tone"] }))
    : [people[1], people[2]];
  if (!here.length) return null;
  const names = here.map((p) => p.name.split(" ")[0]);
  const label =
    names.length === 1
      ? `${names[0]} is here too`
      : names.length === 2
        ? `${names.join(" and ")} are here too`
        : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} are here too`;
  return (
    <Tooltip content={label}>
      <span className="mr-1.5 hidden items-center gap-2 lg:flex">
        <span className="relative flex size-2">
          <span className="absolute inset-0 animate-ping bg-malachite opacity-40 motion-reduce:hidden" />
          <span className="relative size-2 bg-malachite" />
        </span>
        <AvatarStack>
          {here.slice(0, 4).map((p) => (
            <Avatar key={p.id} name={p.name} src={p.avatar} tone={p.tone} size="sm" />
          ))}
        </AvatarStack>
      </span>
    </Tooltip>
  );
}

type FilterMenuProps = {
  state: BoardState;
  // How many tasks each shelf has, counting those still on the server, for a live board
  counts?: Record<Shelf, ShelfCount>;
  // Reads ahead what a change to the filters would show
  preload: (patch: Filters) => void;
  filters: Filters;
  setFilter: (field: FilterField, values: string[]) => void;
  setFilters: (patch: Filters) => void;
  count: number;
  onClear: () => void;
  unsaved: boolean;
  kept: boolean;
  onSave: () => void;
  onForget: () => void;
};

// The menu counts every option against every task, so that only happens while it's open
function FilterMenu(props: FilterMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger className={tool(props.count > 0)}>
        <Icon name="filter" size="sm" />
        <span className="hidden @2xl:inline">Filter</span>
        {props.count ? (
          <span className="grid h-4 min-w-4 place-items-center bg-lapis px-1 font-mono text-[10px] text-on-accent">
            {props.count}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      {open ? <FilterMenuItems {...props} /> : null}
    </DropdownMenu>
  );
}

function FilterMenuItems({
  state,
  counts,
  preload,
  filters,
  setFilter,
  setFilters,
  count,
  onClear,
  unsaved,
  kept,
  onSave,
  onForget,
}: FilterMenuProps) {
  const everything = Object.values(state.tasks);
  const all = filters.archived ? everything : everything.filter((t) => !t.archived);
  // Done and archived work still on the server counts too. The rest of the menu counts what the board holds
  const whole = (s: Shelf) => (counts ? (totalOf(counts[s]) ?? counts[s].held) : undefined);
  const archived = whole("archived") ?? everything.length - everything.filter((t) => !t.archived).length;
  const finished =
    counts && !filters.archived
      ? whole("done")! + whole("canceled")!
      : all.filter((t) => closed(t.status)).length;
  // How many tasks hold each value of each field, in one pass
  const tally = new Map<string, number>();
  for (const t of all)
    for (const f of filterFields)
      for (const v of valueOf(t, f)) tally.set(`${f}:${v}`, (tally.get(`${f}:${v}`) ?? 0) + 1);
  return (
    <DropdownMenuContent align="end" className="w-52">
      <DropdownMenuCheckboxItem
        checked={Boolean(filters.hideDone)}
        onCheckedChange={(on) => setFilters({ hideDone: on })}
        onSelect={(e) => e.preventDefault()}
        onPointerEnter={() => filters.hideDone && preload({ hideDone: false })}
        onFocus={() => filters.hideDone && preload({ hideDone: false })}
      >
        <Icon name="eye-off" /> Hide done
        <span className="ml-auto pl-2 font-mono text-[11px] text-ink-3">{finished}</span>
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem
        checked={Boolean(filters.archived)}
        onCheckedChange={(on) => setFilters({ archived: on })}
        onSelect={(e) => e.preventDefault()}
        onPointerEnter={() => !filters.archived && preload({ archived: true })}
        onFocus={() => !filters.archived && preload({ archived: true })}
      >
        <Icon name="archive" /> Show archived
        <span className="ml-auto pl-2 font-mono text-[11px] text-ink-3">{archived}</span>
      </DropdownMenuCheckboxItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Filter by</DropdownMenuLabel>
      {filterFields.map((f) => {
        const on = filters[f] ?? [];
        return (
          <DropdownMenuSub key={f}>
            <DropdownMenuSubTrigger>
              <Icon name={fieldIcon[f]} /> {fieldLabel[f]}
              {on.length ? <span className="font-mono text-[11px] text-lapis">{on.length}</span> : null}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {fieldOptions[f].map((o) => (
                <DropdownMenuCheckboxItem
                  key={o.value}
                  checked={on.includes(o.value)}
                  onCheckedChange={(checked) =>
                    setFilter(f, checked ? [...on, o.value] : on.filter((v) => v !== o.value))
                  }
                >
                  {o.icon}
                  <span className={cn("truncate", o.muted && "text-ink-3")}>{o.label}</span>
                  <span className="ml-auto pl-2 font-mono text-[11px] text-ink-3">
                    {tally.get(`${f}:${o.value}`) ?? 0}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        );
      })}
      {count || kept ? <DropdownMenuSeparator /> : null}
      {count && unsaved ? (
        <DropdownMenuItem onSelect={onSave}>
          <Icon name="check" /> Save filters for this board
        </DropdownMenuItem>
      ) : null}
      {kept ? (
        <DropdownMenuItem onSelect={onForget}>
          <Icon name="reset" /> Forget saved filters
        </DropdownMenuItem>
      ) : null}
      {count ? (
        <DropdownMenuItem onSelect={onClear}>
          <Icon name="x" /> Clear filters
        </DropdownMenuItem>
      ) : null}
    </DropdownMenuContent>
  );
}

function Sidebar({
  full,
  live,
  state,
  counts,
  prefs,
  setPrefs,
  onOpenTask,
  onNavigate,
  keep,
  onReset,
}: {
  full: boolean;
  live?: LiveBoard;
  state: BoardState;
  counts: Record<Shelf, ShelfCount>;
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  onOpenTask: (id: string) => void;
  onNavigate: () => void;
  keep: () => void;
  onReset: () => void;
}) {
  // Archived tasks are put away, so they count for neither the board nor its progress. Tasks still on the server
  // count, as far as they're known
  const current = Object.values(state.tasks).filter((t) => !t.archived);
  const byStatus = (s: StatusCategory) => totalOf(counts[s]) ?? counts[s].held;
  const total = statusShelves.reduce((n, s) => n + byStatus(s), 0);
  const progress = boardProgress(byStatus, Boolean(prefs.filters.hideDone));
  const mine = current.filter((t) => t.assignee === me.id && !closed(t.status)).length;
  // On a real workspace My tasks is its own page. The demo has one board, so there it filters
  const onlyMine = !live && prefs.filters.assignee?.length === 1 && prefs.filters.assignee[0] === me.id;
  const item = navItem;

  return (
    <>
      {full ? (
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3">
          <Wordmark
            href={live ? `/${live.workspace.slug}/${live.board.slug}` : "/"}
            className="[&>span:last-child]:text-base"
          />
          {live ? null : <Badge tone="pyrite">Demo</Badge>}
        </div>
      ) : null}
      {full && !live && authReady ? (
        <Link
          href="/new"
          className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-lapis-soft px-3 text-xs text-lapis-ink hover:bg-lapis hover:text-on-accent"
        >
          <Icon name="plus" size="sm" />
          Start your own board
          <Icon name="arrow-right" size="sm" className="ml-auto" />
        </Link>
      ) : null}
      {live ? (
        <WorkspaceMenu workspace={live.workspace} workspaces={live.workspaces} />
      ) : (
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
          <Avatar name={demoWorkspace.name} sigil={demoWorkspace.sigil} tone={demoWorkspace.tone} size="sm" />
          <span className="truncate text-sm font-medium">{demoWorkspace.name}</span>
        </div>
      )}

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 text-sm">
        <Inbox state={state} onOpenTask={onOpenTask} className={item(false)} />
        {live ? (
          <MyTasksLink shell={live} active={false} onNavigate={onNavigate} />
        ) : (
          <button
            className={item(onlyMine)}
            aria-pressed={onlyMine}
            onClick={() => {
              setPrefs({ filters: onlyMine ? {} : { assignee: [me.id] } });
              onNavigate();
            }}
          >
            <Icon name="user" size="sm" />
            My tasks
            {mine ? <span className="ml-auto font-mono text-[11px] text-ink-3">{mine}</span> : null}
          </button>
        )}
        <p className="mt-4 mb-1 flex h-5 items-center justify-between px-2 font-mono text-[11px] text-ink-3">
          Boards
          {live && can(live.workspace.role, live.workspace.permissions, "boards") ? <NewBoard live={live} /> : null}
        </p>
        {live ? (
          <BoardLinks
            live={live}
            total={total}
            active
            isPublic={state.roadmap.public}
            item={item}
            onNavigate={onNavigate}
            keep={keep}
          />
        ) : (
          <button className={item(!onlyMine)} onClick={onNavigate} aria-current="page">
            <Icon name="board" size="sm" />
            <span className="truncate">{demoBoard}</span>
            <span className="ml-auto font-mono text-[11px] text-ink-3">{total}</span>
          </button>
        )}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <p className="truncate font-mono text-[11px] text-ink-3">{progress.text}</p>
        <div className="mt-1.5 flex h-1.5 gap-px" aria-hidden>
          {progress.cells.map((tone, i) => (
            <span key={i} className={cn("flex-1", tone)} />
          ))}
        </div>
        {live ? (
          <div className="mt-3 flex items-center justify-between">
            <span className="flex min-w-0 items-center gap-2">
              <AccountButton />
              <span className="truncate text-xs text-ink-2">{live.me.name}</span>
            </span>
            <ThemeControls side="top" />
          </div>
        ) : full ? (
          <div className="mt-3 flex items-center justify-between">
            <button onClick={onReset} className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink">
              <Icon name="reset" size="sm" /> Reset demo
            </button>
            <ThemeControls side="top" />
          </div>
        ) : null}
      </div>
    </>
  );
}

function SaveState({ status }: { status: SaveStatus }) {
  const label = { saved: "Saved", saving: "Saving", offline: "Offline, retrying", error: "Couldn’t save" }[status];
  return (
    <span
      role="status"
      className={cn(
        "hidden items-center gap-1.5 font-mono text-[11px] sm:flex",
        status === "offline" || status === "error" ? "text-hematite" : "text-ink-3",
      )}
    >
      {status === "saving" ? (
        <Spinner label="Saving" />
      ) : (
        <span className={cn("size-1.5", status === "saved" ? "bg-malachite" : "bg-hematite")} />
      )}
      {label}
    </span>
  );
}

// The newest things other people did, newest first. One pass keeps the few newest, so nothing else on the board
// is copied or sorted
function latestActivity(tasks: BoardState["tasks"], limit: number) {
  const top: (Task["activity"][number] & { task: Task })[] = [];
  for (const t of Object.values(tasks)) {
    for (const a of t.activity) {
      if (top.length === limit && a.at <= top[limit - 1].at) continue;
      if (a.who === me.name) continue;
      let at = top.length;
      while (at > 0 && top[at - 1].at < a.at) at--;
      top.splice(at, 0, { ...a, task: t });
      if (top.length > limit) top.pop();
    }
  }
  return top;
}

function Inbox({
  state,
  onOpenTask,
  className,
}: {
  state: BoardState;
  onOpenTask: (id: string) => void;
  className: string;
}) {
  const now = useNow();
  const [seen, setSeen] = useState(0);
  const feed = useMemo(() => latestActivity(state.tasks, 12), [state.tasks]);
  const unread = now ? feed.filter((a) => a.at > seen && now - a.at < 2 * 86_400_000).length : 0;

  return (
    <Popover onOpenChange={(open) => !open && now && setSeen(now)}>
      <PopoverTrigger className={className}>
        <Icon name="inbox" size="sm" />
        Inbox
        {unread ? (
          <span className="ml-auto grid h-4 min-w-4 place-items-center bg-lapis px-1 font-mono text-[10px] text-on-accent">
            {unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-80">
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <span className="text-sm font-medium">Inbox</span>
          <span className="font-mono text-[11px] text-ink-3">Latest from your team</span>
        </div>
        <ol className="max-h-96 overflow-y-auto py-1">
          {feed.map((a, i) => {
            const person = people.find((p) => p.name.startsWith(a.who));
            const fresh = now !== null && a.at > seen && now - a.at < 2 * 86_400_000;
            return (
              <li key={`${a.task.id}-${a.at}-${i}`}>
                <button
                  onClick={() => onOpenTask(a.task.id)}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left outline-none hover:bg-sunken focus-visible:bg-sunken"
                >
                  {person ? (
                    <Avatar name={person.name} src={person.avatar} tone={person.tone} size="sm" />
                  ) : (
                    <span className="size-6 shrink-0 border border-dashed border-line-strong" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-ink-2">
                      <span className="font-medium text-ink">{a.who}</span> {a.text}
                    </span>
                    <span className="mt-0.5 block truncate text-xs">
                      <span className="font-mono text-[11px] text-ink-3">{a.task.id}</span> {a.task.title}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="font-mono text-[10px] text-ink-3">{now ? timeAgo(a.at, now) : ""}</span>
                    {fresh ? <span className="size-1.5 bg-lapis" aria-label="Unread" /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="flex justify-end border-t border-line px-3 py-2">
          <button
            disabled={!unread}
            onClick={() => now && setSeen(now)}
            className="text-[11px] text-ink-3 hover:text-ink disabled:opacity-40"
          >
            Mark all read
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const shortcutGroups: { title: string; items: [string[], string][] }[] = [
  {
    title: "Anywhere",
    items: [
      [["C"], "New task"],
      [["/"], "Search"],
      [["1"], "Table"],
      [["2"], "Board"],
      [["3"], "Roadmap"],
      [["4"], "Public roadmap"],
      [["⌘", "Z"], "Undo"],
      [["⇧", "⌘", "Z"], "Redo"],
      [["?"], "These shortcuts"],
    ],
  },
  {
    title: "Table",
    items: [
      [["←", "↑", "↓", "→"], "Move between cells"],
      [["Enter"], "Edit the cell"],
      [["Space"], "Open the task"],
      [["X"], "Select the row"],
      [["⇧", "↑ ↓"], "Extend the selection"],
      [["⌥", "↑ ↓"], "Move the row"],
      [["Drag"], "Move a row by its number"],
      [["⌘", "A"], "Select all rows"],
      [["Delete"], "Clear the cell"],
      [["⌘", "⌫"], "Delete the rows"],
      [["⌘", "C"], "Copy a cell"],
      [["⌘", "V"], "Paste into the cells"],
      [["Esc"], "Clear the selection"],
    ],
  },
  {
    title: "Roadmap",
    items: [
      [["Drag"], "Move a bar, or its ends"],
      [["←", "→"], "Move a bar a day"],
      [["⇧", "← →"], "Change its length"],
      [["Click"], "Schedule a task without dates"],
    ],
  },
  {
    title: "Board",
    items: [
      [["Space"], "Pick up or drop a card"],
      [["←", "→"], "Carry it across columns"],
      [["↑", "↓"], "Carry it within a column"],
      [["Enter"], "Open the card"],
    ],
  },
];

function Shortcuts({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Keyboard shortcuts"
        description="Everything on the board works from the keyboard."
        className="max-w-2xl"
      >
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {shortcutGroups.map((g) => (
            <section key={g.title} className={cn(g.title === "Table" && "sm:row-span-2")}>
              <h3 className="mb-2 flex items-center gap-2 font-mono text-[11px] text-ink-3">
                <DitherFill level={50} tone="lapis" className="size-2" />
                {g.title}
              </h3>
              <dl className="divide-y divide-line border-y border-line">
                {g.items.map(([keys, what]) => (
                  <div key={what} className="flex items-center justify-between gap-4 py-1.5 text-sm">
                    <dt className="text-ink-2">{what}</dt>
                    <dd className="flex shrink-0 gap-1">
                      {keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </D.Root>
  );
}

// The sidebar's progress. Normally how much of the planned work is done. With done work hidden, how much of what's
// left is underway, in review then in progress, in the colours their columns use. Canceled work isn't left to do,
// so it counts for neither
function boardProgress(count: (s: StatusCategory) => number, hideDone: boolean) {
  const cells = (parts: [number, string][], of: number) => {
    const out: string[] = [];
    let at = 0;
    for (const [n, tone] of parts) {
      const end = Math.round(((at += n) / Math.max(1, of)) * 24);
      while (out.length < end) out.push(tone);
    }
    while (out.length < 24) out.push("bg-line");
    return out;
  };
  // A board's own name for a status is kept as written. The usual ones read as part of the sentence
  const word = (s: StatusCategory) =>
    statusTitle[s] === defaultStatusTitle[s] ? statusTitle[s].toLowerCase() : statusTitle[s];
  const all = statusShelves.reduce((n, s) => n + count(s), 0);

  if (!hideDone) {
    const done = count("done");
    const planned = all - count("canceled");
    return { text: `${done} of ${planned} ${word("done")}`, cells: cells([[done, "bg-malachite"]], planned) };
  }
  const open = all - count("done") - count("canceled");
  const review = count("review");
  const doing = count("in_progress");
  const underway = review + doing;
  const text = !open
    ? "Nothing left to do"
    : !underway
      ? `${open} to do, none started yet`
      : underway === open
        ? `All ${open} underway${review ? `, ${review} ${word("review")}` : ""}`
        : `${underway} of ${open} underway${review ? `, ${review} ${word("review")}` : ""}`;
  return {
    text,
    cells: cells(
      [
        [review, "bg-lapis"],
        [doing, "bg-pyrite"],
      ],
      open,
    ),
  };
}
