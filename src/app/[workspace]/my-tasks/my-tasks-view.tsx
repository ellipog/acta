"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog as D } from "radix-ui";
import { PriorityIcon, StatusMarker } from "@/components/markers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DueLabel, dueState, useToday } from "@/components/ui/date-picker";
import { SheetContent } from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/ui/display";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceNav } from "@/components/workspace-nav";
import { cachedShell, rememberShell, setMine, type Shell } from "@/lib/board-cache";
import { closed, priorityRank, statuses, statusTitle, type StatusCategory } from "@/lib/board-store";
import { moveTask } from "@/lib/my-tasks";
import { cn } from "@/lib/utils";
import type { MyBoard, MyTask } from "@/lib/workspace";

// Everything assigned to you in the workspace, a section per board. Status changes save straight to the board.
// A task moved here stays in the list until you leave, so it can be put back

type Tab = "open" | "closed";
type Sort = "status" | "due" | "priority";

const sorts: { id: Sort; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "due", label: "Due date" },
  { id: "priority", label: "Priority" },
];

// What's moving comes first
const activeFirst: Record<StatusCategory, number> = {
  in_progress: 0,
  review: 1,
  todo: 2,
  backlog: 3,
  done: 4,
  canceled: 5,
};

const idOf = (t: MyTask) => `${t.board}:${t.number}`;
const byDue = (a: MyTask, b: MyTask) => (a.due ?? "9999").localeCompare(b.due ?? "9999");

const iconButton =
  "grid size-8 shrink-0 place-items-center text-ink-2 outline-none hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-lapis";

export function MyTasksView({ shell, boards, tasks }: { shell: Shell; boards: MyBoard[]; tasks: MyTask[] }) {
  const ws = shell.workspace.slug;
  const today = useToday();
  const [navOpen, setNavOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("open");
  const [sort, setSort] = useState<Sort>("status");
  const [query, setQuery] = useState("");

  // Statuses changed on this visit, over what the server sent. A fresh copy from the server starts over
  const [moved, setMoved] = useState<Record<string, StatusCategory>>({});
  const [kept, setKept] = useState<Set<string>>(() => new Set());
  const [from, setFrom] = useState(tasks);
  if (from !== tasks) {
    setFrom(tasks);
    setMoved({});
  }
  const movedRef = useRef(moved);
  useEffect(() => {
    movedRef.current = moved;
  });

  useEffect(() => rememberShell(shell), [shell]);

  const statusOf = (t: MyTask) => moved[idOf(t)] ?? t.status;
  const list = useMemo(() => tasks.map((t) => ({ ...t, status: moved[idOf(t)] ?? t.status })), [tasks, moved]);

  // My tasks in the sidebar follows along as tasks open and close here
  useEffect(() => {
    const open: Record<string, number> = Object.fromEntries(boards.map((b) => [b.id, 0]));
    for (const t of list) if (!closed(t.status)) open[t.board] = (open[t.board] ?? 0) + 1;
    setMine(open);
  }, [list, boards]);

  const q = query.trim().toLowerCase();
  const shown = list.filter((t) => {
    const here = tab === "open" ? !closed(t.status) || kept.has(idOf(t)) : closed(t.status);
    if (!here) return false;
    return (
      !q ||
      t.title.toLowerCase().includes(q) ||
      t.key.toLowerCase().includes(q) ||
      (t.project ?? "").toLowerCase().includes(q)
    );
  });

  const order = (a: MyTask, b: MyTask) => {
    if (tab === "closed") return (b.shipped ?? "").localeCompare(a.shipped ?? "") || b.updated - a.updated;
    if (sort === "due") return byDue(a, b) || activeFirst[a.status] - activeFirst[b.status];
    if (sort === "priority") return priorityRank[a.priority] - priorityRank[b.priority] || byDue(a, b);
    // Moved this visit keeps its place, so a task doesn't jump away from under the pointer
    const sa = kept.has(idOf(a)) ? (tasks.find((x) => idOf(x) === idOf(a))?.status ?? a.status) : a.status;
    const sb = kept.has(idOf(b)) ? (tasks.find((x) => idOf(x) === idOf(b))?.status ?? b.status) : b.status;
    return activeFirst[sa] - activeFirst[sb];
  };

  const sections = boards
    .map((b) => ({ board: b, rows: shown.filter((t) => t.board === b.id).sort(order) }))
    .filter((s) => s.rows.length);

  const open = list.filter((t) => !closed(t.status));
  const overdue = open.filter((t) => dueState(t.due, today) === "overdue").length;
  const closedCount = list.length - open.length;

  const move = async (t: MyTask, to: StatusCategory) => {
    const id = idOf(t);
    const was = movedRef.current[id] ?? t.status;
    if (was === to) return;
    setMoved((m) => ({ ...m, [id]: to }));
    setKept((k) => new Set(k).add(id));
    const error = await moveTask(t.board, t.number, was, to);
    if (error) {
      setMoved((m) => ({ ...m, [id]: was }));
      toast({
        icon: "x",
        title: `${t.key} didn’t move`,
        description:
          error.code === "42501" ? "You can’t edit tasks on that board." : "It’s back where it was. Try again.",
      });
      return;
    }
    toast({
      icon: "check",
      title: `Moved ${t.key} to ${statusTitle[to]}`,
      description: t.title,
      duration: 4000,
      action: { label: "Undo", onClick: () => void move(t, was) },
    });
  };

  const nav = <WorkspaceNav shell={shell} onNavigate={() => setNavOpen(false)} />;

  return (
    <TooltipProvider>
      <div className="flex h-dvh overflow-hidden bg-page text-ink">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">{nav}</aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line bg-surface px-2 sm:px-4">
            <D.Root open={navOpen} onOpenChange={setNavOpen}>
              <D.Trigger aria-label="Open navigation" className={cn(iconButton, "md:hidden")}>
                <Icon name="menu" />
              </D.Trigger>
              <SheetContent title="Navigation">{nav}</SheetContent>
            </D.Root>
            <h1 className="truncate font-display text-lg leading-none">My tasks</h1>
            <span className="hidden font-mono text-[11px] text-ink-3 sm:inline">
              {open.length} open
              {overdue ? <span className="text-hematite"> · {overdue} overdue</span> : null}
            </span>
          </header>

          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface pr-2 sm:pr-4">
            <div role="tablist" aria-label="Which tasks" className="flex h-full shrink-0 items-center pl-1 sm:pl-2">
              {(
                [
                  ["open", "Open", open.length],
                  ["closed", "Done", closedCount],
                ] as const
              ).map(([id, label, n]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "-mb-px flex h-full items-center gap-1.5 border-b-2 px-2.5 text-sm outline-none focus-visible:bg-sunken",
                    tab === id ? "border-lapis text-ink" : "border-transparent text-ink-2 hover:text-ink",
                  )}
                >
                  {label}
                  <span className="font-mono text-[11px] text-ink-3 tabular-nums">{n}</span>
                </button>
              ))}
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-1.5">
              <label className="flex h-8 shrink-0 items-center gap-2 border border-line bg-raised px-2 focus-within:border-lapis">
                <Icon name="search" size="sm" className="text-ink-3" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setQuery("");
                      e.currentTarget.blur();
                    }
                  }}
                  placeholder="Search"
                  aria-label="Search your tasks"
                  className="w-24 bg-transparent text-sm outline-none placeholder:text-ink-3 sm:w-40"
                />
                {query ? (
                  <button aria-label="Clear search" onClick={() => setQuery("")} className="text-ink-3 hover:text-ink">
                    <Icon name="x" size="sm" />
                  </button>
                ) : null}
              </label>
              {tab === "open" ? (
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex h-8 shrink-0 items-center gap-1.5 border border-line bg-raised px-2 text-xs text-ink-2 outline-none hover:border-line-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-lapis data-[state=open]:border-line-strong">
                    <Icon name="sort" size="sm" />
                    <span className="hidden sm:inline">{sorts.find((s) => s.id === sort)?.label}</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as Sort)}>
                      {sorts.map((s) => (
                        <DropdownMenuRadioItem key={s.id} value={s.id}>
                          {s.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-3 py-6 sm:px-6">
              {sections.map(({ board, rows }) => (
                <section key={board.id} aria-labelledby={`board-${board.id}`}>
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <Icon name="board" size="sm" className="text-ink-3" />
                    <h2 id={`board-${board.id}`} className="truncate text-sm font-medium">
                      <Link href={`/${ws}/${board.slug}`} className="hover:text-lapis hover:underline">
                        {board.name}
                      </Link>
                    </h2>
                    <span className="font-mono text-[11px] text-ink-3 tabular-nums">{rows.length}</span>
                  </div>
                  <ul className="border border-line bg-raised">
                    {rows.map((t) => (
                      <Row
                        key={idOf(t)}
                        task={t}
                        board={board}
                        href={`/${ws}/${board.slug}#${t.key}`}
                        status={statusOf(t)}
                        onMove={(to) => void move(t, to)}
                      />
                    ))}
                  </ul>
                </section>
              ))}

              {sections.length ? null : q ? (
                <EmptyState
                  art="crystal-shard"
                  title="Nothing matches"
                  body="None of your tasks fit that search."
                  action={
                    <Button size="sm" onClick={() => setQuery("")}>
                      <Icon name="x" size="sm" /> Clear the search
                    </Button>
                  }
                />
              ) : tab === "closed" ? (
                <EmptyState
                  art="crystal-tablet"
                  title="Nothing done yet"
                  body="Tasks of yours that are done or canceled gather here."
                />
              ) : list.length ? (
                <EmptyState
                  art="terrain-badlands-strata"
                  title="All clear"
                  body="Nothing open is assigned to you. What you finished is under Done."
                />
              ) : (
                <EmptyState
                  art="crystal-tablet"
                  title="Nothing assigned to you"
                  body={`Tasks assigned to you on any board in ${shell.workspace.name} show up here, grouped by board.`}
                  action={
                    shell.boards[0] ? (
                      <Button size="sm" asChild>
                        <Link href={`/${ws}/${shell.boards[0].slug}`}>
                          <Icon name="board" size="sm" /> Go to {shell.boards[0].name}
                        </Link>
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Row({
  task: t,
  board,
  href,
  status,
  onMove,
}: {
  task: MyTask;
  board: MyBoard;
  href: string;
  status: StatusCategory;
  onMove: (to: StatusCategory) => void;
}) {
  const done = closed(status);
  const tone = (l: string) => board.labels.find((x) => x.id === l)?.tone ?? "lapis";
  return (
    <li className="group/row flex min-h-10 items-center gap-2.5 border-b border-line pr-3 pl-1.5 last:border-b-0 hover:bg-surface">
      <DropdownMenu>
        <Tooltip content={`${statusTitle[status]}. Change it`}>
          <DropdownMenuTrigger
            aria-label={`Status of ${t.key}: ${statusTitle[status]}`}
            className="grid size-7 shrink-0 place-items-center outline-none hover:bg-sunken focus-visible:ring-2 focus-visible:ring-lapis data-[state=open]:bg-sunken"
          >
            <StatusMarker status={status} />
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuLabel>Move {t.key} to</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={status} onValueChange={(v) => onMove(v as StatusCategory)}>
            {statuses.map((s) => (
              <DropdownMenuRadioItem key={s.id} value={s.id}>
                <StatusMarker status={s.id} /> {s.title}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="w-[3.25rem] shrink-0 font-mono text-[11px] text-ink-3">{t.key}</span>
      <Link
        href={href}
        className={cn(
          "min-w-0 flex-1 truncate py-2 text-sm outline-none decoration-lapis/40 underline-offset-2 hover:text-lapis hover:underline focus-visible:underline",
          done && "text-ink-2 line-through decoration-line-strong",
        )}
      >
        {t.title}
      </Link>
      <span className="hidden shrink-0 items-center gap-1 lg:flex">
        {t.labels.slice(0, 2).map((l) => (
          <Badge key={l} tone={tone(l)}>
            {l}
          </Badge>
        ))}
      </span>
      {t.project ? (
        <span className="hidden max-w-28 shrink-0 truncate text-xs text-ink-3 md:inline">{t.project}</span>
      ) : null}
      <span className="flex shrink-0 items-center gap-2.5 text-[11px] text-ink-3">
        {t.subtasks.total ? (
          <span className="hidden font-mono sm:inline">
            {t.subtasks.done}/{t.subtasks.total}
          </span>
        ) : null}
        <PriorityIcon priority={t.priority} />
        {t.due ? (
          <DueLabel due={t.due} done={done} className="w-[4.5rem] justify-end" />
        ) : (
          <span className="hidden w-[4.5rem] sm:block" />
        )}
      </span>
    </li>
  );
}

/** While the page loads: the sidebar when this tab has seen the workspace, and rows that wait */
export function MyTasksFrame({ cached = false }: { cached?: boolean }) {
  return cached ? <Remembered /> : <Frame />;
}

function Remembered() {
  const params = useParams<{ workspace: string }>();
  const [shell] = useState(() => cachedShell(params.workspace));
  return <Frame shell={shell} />;
}

function Frame({ shell }: { shell?: ReturnType<typeof cachedShell> }) {
  return (
    <div aria-busy className="flex h-dvh overflow-hidden bg-page">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        {shell ? (
          <WorkspaceNav shell={shell} />
        ) : (
          <div className="flex flex-col gap-3 p-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="mt-3 h-8" />
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center gap-3 border-b border-line bg-surface px-4">
          <h1 className="font-display text-lg leading-none">My tasks</h1>
        </div>
        <div className="flex h-11 items-center border-b border-line bg-surface px-4">
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-3 py-6 sm:px-6">
          {[4, 2].map((n, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-5 w-32" />
              <div className="flex flex-col gap-px border border-line bg-raised p-2">
                {Array.from({ length: n }, (_, j) => (
                  <Skeleton key={j} className="h-8" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
