"use client";

import { memo, useState } from "react";
import { PriorityIcon, StatusMarker, SubtaskCells } from "@/components/board";
import { Button } from "@/components/ui/button";
import { DueLabel } from "@/components/ui/date-picker";
import { Avatar, EmptyState, Spinner } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { PixelCaret } from "@/components/ui/pixel";
import { closed, personById, sizePoints, type BoardAction, type BoardState, type Task } from "@/lib/board-store";
import { cn } from "@/lib/utils";
import type { Prefs } from "./fields";
import type { ShelfInfo } from "./shelf-info";
import { useTableGroups, type Group } from "./table-groups";
import { TaskMenuList } from "./task-menu";

/** The task of the row an element is in, if any */
const rowOf = (el: EventTarget | null) =>
  el instanceof Element ? (el.closest<HTMLElement>("[data-task]")?.dataset.task ?? null) : null;

/**
 * The table, as a phone shows it: the same groups, sort and filters, with each task as one row to tap rather than
 * a line of cells to edit across a screen too narrow for them. A tap opens the task, a long press its menu
 */
function ListViewBody({
  state,
  dispatch,
  visible,
  onOpen,
  prefs,
  setPrefs,
  filtered,
  onClearFilters,
  shelves,
}: {
  state: BoardState;
  dispatch: (a: BoardAction) => void;
  visible: (t: Task) => boolean;
  onOpen: (id: string) => void;
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  filtered: boolean;
  onClearFilters: () => void;
  metaVersion?: number;
  shelves?: ShelfInfo;
}) {
  const { groups } = useTableGroups({ state, visible, prefs, filtered, shelves });
  const [menu, setMenu] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const toggle = (g: Group) => {
    const folded = prefs.collapsed.includes(g.key);
    if (folded && g.shelf && g.more) shelves?.preload([g.shelf]);
    setPrefs({ collapsed: folded ? prefs.collapsed.filter((k) => k !== g.key) : [...prefs.collapsed, g.key] });
  };

  if (!groups.length)
    return (
      <EmptyState
        art="crystal-shard"
        title="Nothing matches"
        body="No task fits the search and filters. Loosen them to see more of the board."
        action={
          <Button size="sm" onClick={onClearFilters}>
            <Icon name="x" size="sm" /> Clear search and filters
          </Button>
        }
      />
    );

  return (
    <TaskMenuList tasks={state.tasks} taskAt={rowOf} open={menu} onOpenChange={setMenu} dispatch={dispatch} onOpen={onOpen}>
      <div className="h-full overflow-y-auto overscroll-contain bg-page pb-safe">
        {groups.map((g) => {
          const folded = prefs.collapsed.includes(g.key);
          const points = g.rows.reduce((n, t) => n + (t.size ? sizePoints[t.size] : 0), 0);
          return (
            <section key={g.key} aria-label={g.title || "Tasks"}>
              {g.title ? (
                <header className="sticky top-0 z-10 flex h-11 items-center border-b border-line bg-sunken/95 pr-1 backdrop-blur-sm">
                  <button
                    aria-expanded={!folded}
                    onClick={() => toggle(g)}
                    className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-4 text-left outline-none focus-visible:bg-sunken"
                  >
                    <PixelCaret className={cn("shrink-0 text-ink-3 transition-transform", folded && "-rotate-90")} />
                    {g.icon}
                    <span className="truncate text-sm font-medium">{g.title}</span>
                    <span className="font-mono text-[11px] text-ink-3">{g.rows.length + (g.more?.count ?? 0)}</span>
                    {points ? <span className="font-mono text-[11px] text-ink-3">· {points} pt</span> : null}
                  </button>
                  <button
                    aria-label={`Add a task to ${g.title}`}
                    onClick={() => {
                      if (folded) setPrefs({ collapsed: prefs.collapsed.filter((k) => k !== g.key) });
                      setAdding(g.key);
                    }}
                    className="grid size-11 shrink-0 place-items-center text-ink-3 active:bg-raised active:text-ink"
                  >
                    <Icon name="plus" size="sm" />
                  </button>
                </header>
              ) : null}
              {folded ? null : (
                <>
                  <ul>
                    {g.rows.map((t) => (
                      <Row key={t.id} task={t} onOpen={onOpen} menu={menu === t.id} />
                    ))}
                  </ul>
                  {g.more ? (
                    <button
                      onClick={() => g.shelf && shelves?.preload([g.shelf])}
                      className="flex h-11 w-full items-center gap-2 border-b border-line px-4 font-mono text-[11px] text-ink-3"
                    >
                      {g.more.loading ? <Spinner label="Loading" /> : <Icon name="arrow-down" size="sm" />}
                      {g.more.count ? `${g.more.count.toLocaleString()} more` : "More"}
                      {g.more.loading ? " on the way" : ""}
                    </button>
                  ) : null}
                  {adding === g.key ? (
                    <Composer
                      label={g.title ? `New task in ${g.title}` : "New task"}
                      onAdd={(title) => dispatch({ type: "add", status: "todo", title, patch: g.patch })}
                      onClose={() => setAdding(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setAdding(g.key)}
                      className="flex h-11 w-full items-center gap-3 border-b border-line px-4 text-sm text-ink-3 active:bg-surface"
                    >
                      <Icon name="plus" size="sm" /> {g.title ? `Add to ${g.title}` : "Add a task"}
                    </button>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>
    </TaskMenuList>
  );
}

// One task. Rows off screen skip their layout and drawing, so a board of thousands scrolls like one of dozens
const Row = memo(function Row({ task, onOpen, menu }: { task: Task; onOpen: (id: string) => void; menu: boolean }) {
  const person = personById(task.assignee);
  const done = closed(task.status);
  return (
    <li className="[contain-intrinsic-size:auto_4.5rem] [content-visibility:auto]">
      <button
        data-task={task.id}
        onClick={() => onOpen(task.id)}
        className={cn(
          "relative flex w-full touch-hold items-start gap-3 border-b border-line px-4 py-3 text-left outline-none transition-colors active:bg-surface focus-visible:bg-surface",
          menu ? "bg-lapis-soft" : "bg-raised",
          task.archived && "opacity-70",
        )}
      >
        {task.priority === "urgent" && !done ? (
          <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-hematite" />
        ) : null}
        <StatusMarker status={task.status} className="mt-1 shrink-0" />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "line-clamp-2 text-[15px] leading-snug",
              done && "text-ink-2 line-through decoration-line-strong",
            )}
          >
            {task.title}
          </span>
          <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] whitespace-nowrap text-ink-3">
            <span className="font-mono">{task.id}</span>
            {task.priority !== "none" ? <PriorityIcon priority={task.priority} /> : null}
            {task.due ? <DueLabel due={task.due} done={done} /> : null}
            <SubtaskCells subtasks={task.subtasks} />
            {task.comments ? (
              <span className="flex items-center gap-1 font-mono">
                <Icon name="comment" size="sm" />
                {task.comments}
              </span>
            ) : null}
            {task.size ? <span className="font-mono uppercase">{task.size}</span> : null}
            {task.project ? <span className="truncate">{task.project}</span> : null}
            {task.archived ? (
              <span className="flex items-center gap-1">
                <Icon name="archive" size="sm" /> Archived
              </span>
            ) : null}
          </span>
        </span>
        {person ? (
          <Avatar name={person.name} src={person.avatar} tone={person.tone} size="sm" className="mt-0.5 shrink-0" />
        ) : null}
      </button>
    </li>
  );
});

function Composer({ label, onAdd, onClose }: { label: string; onAdd: (title: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    if (draft.trim()) onAdd(draft.trim());
    setDraft("");
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2 border-b border-line bg-raised px-3 py-2"
    >
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        onBlur={() => {
          submit();
          onClose();
        }}
        enterKeyHint="done"
        placeholder="Task title"
        aria-label={label}
        className="h-10 min-w-0 flex-1 border border-lapis bg-raised px-3 text-base outline-none placeholder:text-ink-3"
      />
      <Button type="submit" variant="primary" size="sm" onMouseDown={(e) => e.preventDefault()}>
        Add
      </Button>
    </form>
  );
}

export const ListView = memo(ListViewBody);
