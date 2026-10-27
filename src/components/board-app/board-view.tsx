"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
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

type Columns = BoardState["columns"];

const columnOf = (cols: Columns, id: string): StatusCategory | undefined => {
  if (id in cols) return id as StatusCategory;
  return (Object.keys(cols) as StatusCategory[]).find((c) => cols[c].includes(id));
};

export function BoardView({ state, dispatch, visible, onOpen, prefs, setPrefs }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // Where the cards are while one is carried. Nothing is saved until it's dropped, so a drag is one change
  // that one undo takes back, and a cancelled drag leaves no trace
  const [preview, setPreview] = useState<Columns | null>(null);
  // Which columns were open wide when the drag started. They stay that way until it ends, so nothing on the
  // board changes width under the card
  const [wide, setWide] = useState<Set<StatusCategory> | null>(null);
  const columns = preview ?? state.columns;
  const live = useRef(columns);
  useLayoutEffect(() => {
    live.current = columns;
  });
  const dndId = useId();
  // The column the card was picked up from
  const [start, setStart] = useState<StatusCategory | null>(null);
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

  // First the column under the pointer, or the nearest one when it's between columns. Then the card in that
  // column nearest the one being carried, or the column itself when it has none. Measuring every card on the
  // board against every column's corners made empty columns hard to hit, and the target jump about
  const collide = useCallback<CollisionDetection>((args) => {
    const cols = live.current;
    const lanes = args.droppableContainers.filter((c) => String(c.id) in cols);
    const under = args.pointerCoordinates ? pointerWithin({ ...args, droppableContainers: lanes }) : [];
    const lane = (under.length ? under : closestCenter({ ...args, droppableContainers: lanes }))[0]?.id;
    if (lane === undefined) return [];
    const inLane = new Set(cols[lane as StatusCategory]);
    const cards = args.droppableContainers.filter((c) => inLane.has(String(c.id)));
    return cards.length ? closestCenter({ ...args, droppableContainers: cards }) : [{ id: lane }];
  }, []);

  const onDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    setActiveId(id);
    setPreview(state.columns);
    setWide(new Set(statuses.filter((s) => !rail(s.id)).map((s) => s.id)));
    setStart(columnOf(state.columns, id) ?? null);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const cols = live.current;
    const id = String(active.id);
    const overId = String(over.id);
    const from = columnOf(cols, id);
    const to = columnOf(cols, overId);
    if (!from || !to || from === to) return;
    const target = cols[to];
    let index = target.length;
    if (!(overId in cols)) {
      const overIndex = target.indexOf(overId);
      const below =
        active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
      index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : target.length;
    }
    setPreview({
      ...cols,
      [from]: cols[from].filter((x) => x !== id),
      [to]: [...target.slice(0, index), id, ...target.slice(index)],
    });
  };

  const finish = () => {
    setActiveId(null);
    setPreview(null);
    setWide(null);
    setStart(null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    let cols = live.current;
    const col = columnOf(cols, id);
    if (over && col) {
      const overId = String(over.id);
      const items = cols[col];
      if (overId !== id && !(overId in cols) && items.includes(overId))
        cols = { ...cols, [col]: arrayMove(items, items.indexOf(id), items.indexOf(overId)) };
    }
    finish();
    lastDrop.current = Date.now();
    if (!col) return;
    const list = cols[col];
    const moved = col !== start;
    dispatch({
      type: "move",
      id,
      to: col,
      before: list[list.indexOf(id) + 1] ?? null,
      note: moved ? `moved it to ${statuses.find((s) => s.id === col)?.title ?? col}` : undefined,
    });
  };

  const open = (id: string) => {
    if (Date.now() - lastDrop.current > 200) onOpen(id);
  };

  const active = activeId ? state.tasks[activeId] : null;
  const hideDone = Boolean(prefs?.filters.hideDone);
  // Done hidden by the filter, and Canceled while it's empty, sit as a narrow rail at the end. A card can be
  // dropped on either, and nothing appears or disappears when a drag starts
  const rail = (s: StatusCategory) => {
    if (wide) return !wide.has(s);
    if (collapsed(s)) return true;
    if (closed(s) && hideDone) return true;
    if (s === "canceled") return !state.columns.canceled.some((id) => state.tasks[id] && visible(state.tasks[id]));
    return false;
  };
  const target = activeId ? columnOf(columns, activeId) : undefined;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collide}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
    >
      <div className="flex h-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain p-3 sm:snap-none">
        {statuses.map((s) => {
          const ids = columns[s.id].filter((id) => state.tasks[id] && visible(state.tasks[id]));
          const points = ids.reduce((n, id) => n + (state.tasks[id].size ? sizePoints[state.tasks[id].size!] : 0), 0);
          const hidden = closed(s.id) && hideDone;
          return (
            <Column
              key={s.id}
              status={s.id}
              title={s.title}
              count={hidden ? 0 : ids.length}
              points={points}
              collapsed={rail(s.id)}
              targeted={target === s.id && target !== start}
              railHint={
                hidden
                  ? `${s.title} is hidden by the filter. Drop a card here, or click to show it`
                  : s.id === "canceled" && !collapsed(s.id)
                    ? "Drop a card here to cancel it"
                    : undefined
              }
              onToggle={
                !setPrefs || !prefs
                  ? undefined
                  : hidden
                    ? () => setPrefs({ filters: { ...prefs.filters, hideDone: false } })
                    : // An empty Canceled has nothing to open up
                      s.id === "canceled" && !collapsed(s.id) && rail(s.id)
                      ? undefined
                      : () => toggleCollapsed(s.id)
              }
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
  targeted,
  railHint,
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
  // A card being carried would land here
  targeted: boolean;
  railHint?: string;
  onToggle?: () => void;
  onArchive?: () => void;
  dispatch: (a: DemoAction) => void;
  children: React.ReactNode;
}) {
  // The whole column takes drops, header included, so a card can be let go anywhere over it
  const { setNodeRef } = useDroppable({ id: status });
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
    const inner = (
      <>
        <StatusMarker status={status} />
        <span className="font-mono text-[11px] text-ink-3">{count || ""}</span>
        <span className="text-sm font-medium [writing-mode:vertical-rl]">{title}</span>
      </>
    );
    const rail = (
      <section
        ref={setNodeRef}
        className={cn(
          "flex w-11 shrink-0 flex-col items-center border bg-sunken/50 transition-colors",
          targeted ? "border-lapis bg-lapis-soft" : "border-line",
        )}
      >
        <DitherFill level={band[status].level} tone={band[status].tone} className="h-1 w-full shrink-0" />
        {onToggle ? (
          <button
            onClick={onToggle}
            aria-label={railHint ?? `Expand ${title}`}
            className="flex w-full flex-1 flex-col items-center gap-3 pt-3 text-ink-2 hover:bg-sunken hover:text-ink"
          >
            {inner}
          </button>
        ) : (
          <div aria-label={railHint ?? title} className="flex w-full flex-1 flex-col items-center gap-3 pt-3 text-ink-3">
            {inner}
          </div>
        )}
      </section>
    );
    return railHint ? (
      <Tooltip content={railHint} side="left">
        {rail}
      </Tooltip>
    ) : (
      rail
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
    <section
      ref={setNodeRef}
      className={cn(
        "flex w-[min(85vw,18rem)] shrink-0 snap-start flex-col border bg-sunken/50 transition-colors lg:w-auto lg:max-w-[26rem] lg:min-w-[16.5rem] lg:flex-1",
        targeted ? "border-lapis/60" : "border-line",
      )}
    >
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
        ref={listRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors",
          targeted && "bg-lapis-soft/40",
        )}
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
