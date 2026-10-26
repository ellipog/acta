"use client";

import { useId, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@/components/ui/icons";
import { DropSlot, StatusMarker, TaskCard } from "@/components/board";
import { Dither, DitherFill, type DitherTone } from "@/components/ui/dither";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import {
  archiveTasks,
  closed,
  sizePoints,
  statuses,
  type BoardState,
  type StatusCategory,
  type Task,
} from "@/lib/board-store";
import { cn } from "@/lib/utils";
import type { DemoAction } from "./demo-state";
import type { Prefs } from "./fields";
import { TaskMenu } from "./task-menu";

type Props = {
  state: BoardState;
  dispatch: (a: DemoAction) => void;
  visible: (t: Task) => boolean;
  onOpen: (id: string) => void;
  prefs?: Prefs;
  setPrefs?: (patch: Partial<Prefs>) => void;
};

export function BoardView({ state, dispatch, visible, onOpen, prefs, setPrefs }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const dndId = useId();
  const startStatus = useRef<StatusCategory | null>(null);
  const marked = useRef(false);
  const lastDrop = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  const collapsed = (s: StatusCategory) => prefs?.collapsed.includes(`board:${s}`) ?? false;
  const toggleCollapsed = (s: StatusCategory) =>
    setPrefs?.({
      collapsed: collapsed(s) ? prefs!.collapsed.filter((k) => k !== `board:${s}`) : [...prefs!.collapsed, `board:${s}`],
    });

  const columnOf = (id: string): StatusCategory | undefined => {
    if (id in state.columns) return id as StatusCategory;
    return (Object.keys(state.columns) as StatusCategory[]).find((c) => state.columns[c].includes(id));
  };

  const mark = (id: string) => {
    if (marked.current) return;
    marked.current = true;
    dispatch({ type: "checkpoint", label: `Moved ${id}` });
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    marked.current = false;
    startStatus.current = columnOf(String(active.id)) ?? null;
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const id = String(active.id);
    const from = columnOf(id);
    const to = columnOf(String(over.id));
    if (!from || !to || from === to) return;
    const target = state.columns[to];
    let index = target.length;
    if (!(String(over.id) in state.columns)) {
      const overIndex = target.indexOf(String(over.id));
      const below =
        active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
      index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : target.length;
    }
    mark(id);
    dispatch({
      type: "columns",
      columns: {
        ...state.columns,
        [from]: state.columns[from].filter((x) => x !== id),
        [to]: [...target.slice(0, index), id, ...target.slice(index)],
      },
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    setActiveId(null);
    lastDrop.current = Date.now();
    const col = columnOf(id);
    if (over && col && columnOf(String(over.id)) === col) {
      const items = state.columns[col];
      const a = items.indexOf(id);
      const b = items.indexOf(String(over.id));
      if (b >= 0 && a !== b) {
        mark(id);
        dispatch({ type: "columns", columns: { ...state.columns, [col]: arrayMove(items, a, b) } });
      }
    }
    if (col && startStatus.current && col !== startStatus.current) {
      const title = statuses.find((s) => s.id === col)?.title ?? col;
      dispatch({ type: "silent", action: { type: "update", id, patch: { status: col }, note: `moved it to ${title}` } });
    }
  };

  const onDragCancel = () => {
    setActiveId(null);
    if (marked.current) dispatch({ type: "revert" });
  };

  const open = (id: string) => {
    if (Date.now() - lastDrop.current > 200) onOpen(id);
  };

  const active = activeId ? state.tasks[activeId] : null;
  // Canceled shows once something is in it, and Hide done leaves out both finished columns, except while a card
  // is carried, so it can still be dropped there
  const hideDone = Boolean(prefs?.filters.hideDone);
  const shown = statuses.filter((s) => {
    if (activeId) return true;
    if (s.id === "done") return !hideDone;
    if (s.id === "canceled") return !hideDone && state.columns.canceled.some((id) => state.tasks[id] && visible(state.tasks[id]));
    return true;
  });

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="flex h-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain p-3 sm:snap-none">
        {shown.map((s) => {
          const ids = state.columns[s.id].filter((id) => state.tasks[id] && visible(state.tasks[id]));
          const points = ids.reduce((n, id) => n + (state.tasks[id].size ? sizePoints[state.tasks[id].size!] : 0), 0);
          return (
            <Column
              key={s.id}
              status={s.id}
              title={s.title}
              count={ids.length}
              points={points}
              collapsed={collapsed(s.id)}
              onToggle={setPrefs ? () => toggleCollapsed(s.id) : undefined}
              onArchive={
                closed(s.id) && ids.some((id) => !state.tasks[id].archived)
                  ? () => dispatch(archiveTasks(ids.filter((id) => !state.tasks[id].archived), true))
                  : undefined
              }
              dispatch={dispatch}
            >
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                {ids.map((id) => (
                  <SortableTask key={id} task={state.tasks[id]} onOpen={open} dispatch={dispatch} />
                ))}
              </SortableContext>
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(.2,.8,.2,1)" }}>
        {active ? <TaskCard task={active} dragging className="cursor-grabbing" /> : null}
      </DragOverlay>
    </DndContext>
  );
}

const band: Record<StatusCategory, { tone: DitherTone; level: 12 | 25 | 50 | 75 }> = {
  backlog: { tone: "line", level: 12 },
  todo: { tone: "muted", level: 25 },
  in_progress: { tone: "pyrite", level: 50 },
  review: { tone: "lapis", level: 50 },
  done: { tone: "malachite", level: 75 },
  canceled: { tone: "line", level: 25 },
};

function Column({
  status,
  title,
  count,
  points,
  collapsed,
  onToggle,
  onArchive,
  dispatch,
  children,
}: {
  status: StatusCategory;
  title: string;
  count: number;
  points: number;
  collapsed: boolean;
  onToggle?: () => void;
  onArchive?: () => void;
  dispatch: (a: DemoAction) => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [composing, setComposing] = useState<"top" | "bottom" | null>(null);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const submit = () => {
    if (draft.trim()) {
      dispatch({ type: "add", status, title: draft.trim() });
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    }
    setDraft("");
  };

  if (collapsed) {
    return (
      <section
        ref={setNodeRef}
        className={cn(
          "flex w-11 shrink-0 flex-col items-center border border-line bg-sunken/50 transition-colors",
          isOver && "bg-lapis-soft/50",
        )}
      >
        <DitherFill level={band[status].level} tone={band[status].tone} className="h-1 w-full shrink-0" />
        <button
          onClick={onToggle}
          aria-label={`Expand ${title}`}
          className="flex w-full flex-1 flex-col items-center gap-3 pt-3 text-ink-2 hover:bg-sunken hover:text-ink"
        >
          <StatusMarker status={status} />
          <span className="font-mono text-[11px] text-ink-3">{count}</span>
          <span className="text-sm font-medium [writing-mode:vertical-rl]">{title}</span>
        </button>
      </section>
    );
  }

  const composer = (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") {
          setDraft("");
          setComposing(null);
        }
      }}
      onBlur={() => {
        submit();
        setComposing(null);
      }}
      placeholder="Task title, then Enter"
      aria-label={`New task in ${title}`}
      className="h-10 shrink-0 border border-lapis bg-raised px-3 text-sm outline-none placeholder:text-ink-3"
    />
  );

  return (
    <section className="flex w-[min(85vw,18rem)] shrink-0 snap-start flex-col border border-line bg-sunken/50 lg:w-auto lg:max-w-[26rem] lg:min-w-[16.5rem] lg:flex-1">
      <DitherFill level={band[status].level} tone={band[status].tone} className="h-1 shrink-0" />
      <header className="group/col flex h-10 shrink-0 items-center gap-2 border-b border-line bg-surface pr-1 pl-3">
        <StatusMarker status={status} />
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="font-mono text-[11px] text-ink-3">{count}</span>
        {points ? (
          <Tooltip content="Points in this column">
            <span className="font-mono text-[11px] text-ink-3">· {points} pt</span>
          </Tooltip>
        ) : null}
        <div className="ml-auto flex items-center">
          <Tooltip content={`Add to ${title}`}>
            <button
              aria-label={`Add task to ${title}`}
              onClick={() => setComposing("top")}
              className="grid size-7 place-items-center text-ink-3 hover:bg-sunken hover:text-ink"
            >
              <Icon name="plus" size="sm" />
            </button>
          </Tooltip>
          {onToggle ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`${title} options`}
                className="grid size-7 place-items-center text-ink-3 outline-none hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-lapis data-[state=open]:bg-sunken"
              >
                <Icon name="dots" size="sm" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>{title}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => setComposing("bottom")}>
                  <Icon name="plus" /> Add a task
                </DropdownMenuItem>
                {onArchive ? (
                  <DropdownMenuItem onSelect={onArchive}>
                    <Icon name="archive" /> Archive all
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onToggle}>
                  <Icon name="chevron-left" /> Collapse column
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>
      <div
        ref={(el) => {
          setNodeRef(el);
          listRef.current = el;
        }}
        className={cn("flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors", isOver && "bg-lapis-soft/40")}
      >
        {composing === "top" ? composer : null}
        {children}
        {composing === "bottom" ? composer : null}
        {count === 0 && !composing ? (
          <button
            onClick={() => setComposing("bottom")}
            className="group flex flex-1 flex-col items-center justify-center gap-3 py-6 text-xs text-ink-3 hover:text-ink-2"
          >
            <Dither name="crystal-block" tone="line" scale={0.5} smooth className="group-hover:[--dither:var(--lapis)]" />
            Drop a card here, or add one
          </button>
        ) : !composing ? (
          <button
            onClick={() => setComposing("bottom")}
            className="flex h-8 shrink-0 items-center gap-2 px-2 text-xs text-ink-3 hover:bg-sunken hover:text-ink"
          >
            <Icon name="plus" size="sm" /> Add a task
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SortableTask({
  task,
  onOpen,
  dispatch,
}: {
  task: Task;
  onOpen: (id: string) => void;
  dispatch: (a: DemoAction) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <TaskMenu task={task} dispatch={dispatch} onOpen={onOpen}>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        {...attributes}
        {...listeners}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen(task.id);
          else listeners?.onKeyDown?.(e);
        }}
        onClick={() => onOpen(task.id)}
        aria-label={`${task.id}: ${task.title}`}
        className="relative shrink-0 cursor-grab outline-none focus-visible:ring-2 focus-visible:ring-lapis"
      >
        <TaskCard task={task} className={cn(isDragging && "invisible")} />
        {isDragging ? <DropSlot className="absolute inset-0 h-auto" /> : null}
      </div>
    </TaskMenu>
  );
}
