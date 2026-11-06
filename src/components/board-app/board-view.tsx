"use client";

import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
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
import { Spinner } from "@/components/ui/display";
import type { Prefs } from "./fields";
import { placeCards, useCardSizes, useScrollRange, type CardSizes } from "./scroll-window";
import { reading, unseen, waiting, type ShelfInfo } from "./shelf-info";
import { piecesFor, runsFor } from "./table-window";
import { TaskMenuList } from "./task-menu";

type Props = {
  state: BoardState;
  dispatch: (a: DemoAction) => void;
  visible: (t: Task) => boolean;
  onOpen: (id: string) => void;
  prefs?: Prefs;
  setPrefs?: (patch: Partial<Prefs>) => void;
  /** Moves on when the board's people, labels or fields change, so cards that show them are drawn again */
  metaVersion?: number;
  /** The shelves of tasks a live board holds in part, and how many each has */
  shelves?: ShelfInfo;
};

type Columns = BoardState["columns"];

// The same objects every time: new ones would make dnd-kit hand every card on the board a new context, and draw
// them all again
const pointer = { activationConstraint: { distance: 5 } };

// Left and right carry a card to the next column over. dnd-kit's own arrows look for places further left or right
// by their left edges, and the card being carried is tilted, so its edge sits a little left of the cards in its own
// column and the one below it counted as being to the right. Only places whose middle is past the card's own edge
// count as sideways
const carry: KeyboardCoordinateGetter = (event, args) => {
  const { collisionRect, droppableContainers } = args.context;
  const right = event.code === "ArrowRight";
  if ((!right && event.code !== "ArrowLeft") || !collisionRect) return sortableKeyboardCoordinates(event, args);
  const mid = collisionRect.left + collisionRect.width / 2;
  const across = (rect: { left: number; width: number } | undefined) => {
    if (!rect) return false;
    const at = rect.left + rect.width / 2;
    return right ? at > mid + collisionRect.width / 2 : at < mid - collisionRect.width / 2;
  };
  // The places dnd-kit picks from, as the map it reads them through
  const sideways = {
    get: (id: UniqueIdentifier) => droppableContainers.get(id),
    getNodeFor: (id: UniqueIdentifier) => droppableContainers.getNodeFor(id),
    toArray: () => droppableContainers.toArray(),
    getEnabled: () => droppableContainers.getEnabled().filter((c) => across(args.context.droppableRects.get(c.id))),
  } as unknown as typeof droppableContainers;
  return sortableKeyboardCoordinates(event, { ...args, context: { ...args.context, droppableContainers: sideways } });
};

const keyboard = {
  coordinateGetter: carry,
  keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
};

const columnOf = (cols: Columns, id: string): StatusCategory | undefined => {
  if (id in cols) return id as StatusCategory;
  return (Object.keys(cols) as StatusCategory[]).find((c) => cols[c].includes(id));
};

/** The task of the card an element is in, if any */
const cardOf = (el: EventTarget | null) =>
  el instanceof Element ? (el.closest<HTMLElement>("[data-task]")?.dataset.task ?? null) : null;

// The space between cards, and above the first one, in a column's list
const GAP = 8;
const PAD = 8;

function BoardViewBody({ state, dispatch, visible, onOpen, prefs, setPrefs, metaVersion = 0, shelves }: Props) {
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
  const sensors = useSensors(useSensor(PointerSensor, pointer), useSensor(KeyboardSensor, keyboard));
  // One menu for every card, opened for the card pressed (see TaskMenuList)
  const [menu, setMenu] = useState<string | null>(null);
  // The card holding focus stays drawn when its column scrolls away from it, so the keyboard doesn't lose its place
  const [focused, setFocused] = useState<string | null>(null);
  const sizes = useCardSizes();

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

  // The same function for the board's life, so memoized cards aren't drawn again for a new one
  const openNow = useRef(onOpen);
  useLayoutEffect(() => {
    openNow.current = onOpen;
  });
  const open = useCallback((id: string) => {
    if (Date.now() - lastDrop.current > 200) openNow.current(id);
  }, []);

  const active = activeId ? state.tasks[activeId] : null;
  const hideDone = Boolean(prefs?.filters.hideDone);
  // Done hidden by the filter, and Canceled while it's empty, sit as a narrow rail at the end. A card can be
  // dropped on either, and nothing appears or disappears when a drag starts
  const rail = (s: StatusCategory) => {
    if (wide) return !wide.has(s);
    if (collapsed(s)) return true;
    if (closed(s) && hideDone) return true;
    // Canceled opens out once something's in it, read here or still on the server
    if (s === "canceled")
      return !state.columns.canceled.some((id) => state.tasks[id] && visible(state.tasks[id])) && !waiting(shelves, s);
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
      <TaskMenuList
        tasks={state.tasks}
        taskAt={cardOf}
        open={menu}
        onOpenChange={setMenu}
        dispatch={dispatch}
        onOpen={open}
      >
        <div
          onFocusCapture={(e) => setFocused(cardOf(e.target))}
          className="flex h-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain p-3 sm:snap-none"
        >
          {statuses.map((s) => {
            const ids = columns[s.id].filter((id) => state.tasks[id] && visible(state.tasks[id]));
            const points = ids.reduce((n, id) => n + (state.tasks[id].size ? sizePoints[state.tasks[id].size!] : 0), 0);
            const hidden = closed(s.id) && hideDone;
            // Cards still on the server count, and a column being read says how many are on their way
            const more = unseen(shelves, s.id);
            const expanded = !rail(s.id);
            return (
              <Column
                key={s.id}
                status={s.id}
                title={s.title}
                count={hidden ? 0 : ids.length + more}
                points={points}
                more={expanded && waiting(shelves, s.id) ? { count: more, loading: reading(shelves, s.id) } : undefined}
                onPreload={shelves && !expanded ? () => shelves.preload([s.id]) : undefined}
                collapsed={!expanded}
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
                  // All of it, so only once all of it is here
                  closed(s.id) && !waiting(shelves, s.id) && ids.some((id) => !state.tasks[id].archived)
                    ? () => dispatch(archiveTasks(ids.filter((id) => !state.tasks[id].archived), true))
                    : undefined
                }
                dispatch={dispatch}
              >
                {(scroller) => (
                  <Cards
                    ids={ids}
                    tasks={state.tasks}
                    onOpen={open}
                    version={metaVersion}
                    scroller={scroller}
                    sizes={sizes}
                    carried={activeId}
                    focused={focused}
                  />
                )}
              </Column>
            );
          })}
        </div>
      </TaskMenuList>
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
  more,
  onPreload,
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
  // Cards still to come from the server, below the ones showing
  more?: { count: number; loading: boolean };
  // Reads the column's first cards ahead of it opening, as the pointer comes to the rail
  onPreload?: () => void;
  collapsed: boolean;
  // A card being carried would land here
  targeted: boolean;
  railHint?: string;
  onToggle?: () => void;
  onArchive?: () => void;
  dispatch: (a: DemoAction) => void;
  // The cards, drawn as far as the list scrolls
  children: (scroller: HTMLDivElement | null) => React.ReactNode;
}) {
  // The whole column takes drops, header included, so a card can be let go anywhere over it
  const { setNodeRef } = useDroppable({ id: status });
  const [composing, setComposing] = useState<"top" | "bottom" | null>(null);
  const [draft, setDraft] = useState("");
  const [list, setList] = useState<HTMLDivElement | null>(null);

  const submit = () => {
    if (draft.trim()) {
      dispatch({ type: "add", status, title: draft.trim() });
      requestAnimationFrame(() => list?.scrollTo({ top: list.scrollHeight }));
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
            onPointerEnter={onPreload}
            onFocus={onPreload}
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
        ref={setList}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors",
          targeted && "bg-lapis-soft/40",
        )}
      >
        {composing === "top" ? composer : null}
        {children(list)}
        {more ? <MoreCards {...more} /> : null}
        {composing === "bottom" ? composer : null}
        {count === 0 && !more && !composing ? (
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

// Where a column's cards still on the server will come, as many card-shaped places as are on their way, up to a few
function MoreCards({ count, loading }: { count: number; loading: boolean }) {
  return (
    <div role="status" aria-live="polite" className="flex shrink-0 flex-col gap-2">
      {Array.from({ length: Math.min(3, Math.max(1, count)) }, (_, i) => (
        <span key={i} className="h-16 shrink-0 border border-dashed border-line bg-raised/40" aria-hidden />
      ))}
      <span className="flex h-6 items-center gap-2 px-1 font-mono text-[11px] text-ink-3">
        {loading ? <Spinner label="Loading" /> : null}
        {count ? `${count.toLocaleString()} more` : "More"}
        {loading ? " on the way" : ""}
      </span>
    </div>
  );
}

// A column's cards. dnd-kit draws every card of a list again whenever its list of ids is a new array, so the
// list is kept as the same array while the column holds the same cards in the same order.
//
// Only the cards in view and a margin around them are drawn, with an empty block as tall as the cards it skips
// standing in for each stretch left out, so a column of thousands of done cards costs what a screenful does. dnd-kit
// still sorts over every id, and measures each card as it's drawn, so a card carried down a long column lands where
// it would among cards not drawn yet. The card being carried and the one holding focus stay drawn wherever they are
function Cards({
  ids,
  tasks,
  onOpen,
  version,
  scroller,
  sizes,
  carried,
  focused,
}: {
  ids: string[];
  tasks: BoardState["tasks"];
  onOpen: (id: string) => void;
  version: number;
  scroller: HTMLDivElement | null;
  sizes: CardSizes;
  carried: string | null;
  focused: string | null;
}) {
  const key = ids.join(" ");
  const items = useMemo(() => (key ? key.split(" ") : []), [key]);
  const tops = useMemo(() => placeCards(items, sizes.sizes, GAP), [items, sizes.sizes]);
  const range = useScrollRange(scroller, tops, { offset: PAD, margin: 6, step: 8 });
  const pinned = [carried, focused].map((id) => (id ? items.indexOf(id) : -1));
  const drawn: React.ReactNode[] = [];
  for (const p of piecesFor(runsFor(range, pinned, items.length), tops)) {
    // The list's gap follows the block too, so it stands in for one gap fewer than it skips
    if (p.gap) drawn.push(<div key={`gap:${p.from}`} aria-hidden className="shrink-0" style={{ height: p.height - GAP }} />);
    else
      for (let i = p.from; i < p.to; i++)
        drawn.push(
          <SortableTask key={items[i]} task={tasks[items[i]]} onOpen={onOpen} version={version} watch={sizes.watch} />,
        );
  }
  return (
    <SortableContext items={items} strategy={verticalListSortingStrategy}>
      {drawn}
    </SortableContext>
  );
}

const SortableTask = memo(function SortableTask({
  task,
  onOpen,
  version,
  watch,
}: {
  task: Task;
  onOpen: (id: string) => void;
  version: number;
  watch: CardSizes["watch"];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  // The card reports its height as it's drawn and whenever it changes, so the blocks standing in for cards not drawn
  // are as tall as the cards would be
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      if (!el) return;
      const stop = watch(el);
      return () => {
        stop();
        setNodeRef(null);
      };
    },
    [setNodeRef, watch],
  );
  return (
    <div
      ref={ref}
      data-task={task.id}
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
      <CardFace task={task} dragging={isDragging} version={version} />
    </div>
  );
});

// dnd-kit draws every sortable card again each time a drag passes over a new one. The card's face only changes
// with its task, or with the board's people and labels it shows (version), so that part is skipped
const CardFace = memo(function CardFace({ task, dragging }: { task: Task; dragging: boolean; version: number }) {
  return (
    <>
      <TaskCard task={task} className={cn(dragging && "invisible")} />
      {dragging ? <DropSlot className="absolute inset-0 h-auto" /> : null}
    </>
  );
});

// Drawn again only when what it shows changes, not each time the page around it does
export const BoardView = memo(BoardViewBody);
