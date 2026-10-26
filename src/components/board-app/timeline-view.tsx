"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { StatusMarker } from "@/components/board";
import { Avatar, EmptyState } from "@/components/ui/display";
import { DitherFill, type DitherTone } from "@/components/ui/dither";
import { Button } from "@/components/ui/button";
import { formatShort, useToday } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { PixelCaret } from "@/components/ui/pixel";
import { MONTHS, addDays, addMonths, diffDays, monthEnd, monthStart, parts, weekday } from "@/lib/dates";
import {
  formatDue,
  personById,
  sizePoints,
  statuses,
  type BoardState,
  type StatusCategory,
  type Task,
} from "@/lib/board-store";
import { cn } from "@/lib/utils";
import type { DemoAction } from "./demo-state";
import { fieldOptions, patchFor, valueOf, type Prefs, type Zoom } from "./fields";
import { TaskMenu } from "./task-menu";

const PPD: Record<Zoom, number> = { month: 40, quarter: 14, year: 4 };
const SPAN: Record<Zoom, number> = { month: 5, quarter: 14, year: 30 };
const FALLBACK_TODAY = "2026-10-25";

const look: Record<StatusCategory, { border: string; cap: string; tone: DitherTone }> = {
  backlog: {
    border: "border-line-strong",
    cap: "bg-line-strong",
    tone: "line",
  },
  todo: { border: "border-ink-3", cap: "bg-ink-3", tone: "muted" },
  in_progress: { border: "border-pyrite", cap: "bg-pyrite", tone: "pyrite" },
  review: { border: "border-lapis", cap: "bg-lapis", tone: "lapis" },
  done: { border: "border-malachite", cap: "bg-malachite", tone: "malachite" },
};

const accentFill = {
  lapis: "bg-lapis text-on-accent",
  pyrite: "bg-pyrite text-on-accent",
  malachite: "bg-malachite text-on-accent",
  hematite: "bg-hematite text-on-accent",
};

type DragMode = "move" | "start" | "end";
type Drag = { id: string; mode: DragMode; days: number };

const span = (t: Task) => {
  const s = t.start ?? t.due;
  const d = t.due ?? t.start;
  if (!s || !d) return null;
  return s <= d ? { s, d } : { s: d, d: s };
};

function shifted(t: Task, mode: DragMode, days: number): Pick<Task, "start" | "due"> {
  const r = span(t)!;
  if (!t.start) return { due: addDays(r.d, days) };
  if (mode === "move") return { start: addDays(r.s, days), due: addDays(r.d, days) };
  if (mode === "start") {
    const s = addDays(r.s, days);
    return { start: s > r.d ? r.d : s, due: r.d };
  }
  const d = addDays(r.d, days);
  return { start: r.s, due: d < r.s ? r.s : d };
}

export function TimelineView({
  state,
  dispatch,
  visible,
  onOpen,
  prefs,
  setPrefs,
  filtered,
  onClearFilters,
  readOnly,
  lead,
  customGroups,
  accent = "lapis",
}: {
  state: BoardState;
  dispatch: (a: DemoAction) => void;
  visible: (t: Task) => boolean;
  onOpen: (id: string) => void;
  prefs: Pick<Prefs, "grouping" | "zoom" | "collapsed">;
  setPrefs: (patch: Partial<Prefs>) => void;
  filtered: boolean;
  onClearFilters: () => void;
  readOnly?: boolean;
  lead?: (t: Task) => React.ReactNode;
  customGroups?: {
    key: string;
    title: string;
    icon?: React.ReactNode;
    rows: Task[];
  }[];
  accent?: "lapis" | "pyrite" | "malachite" | "hematite";
}) {
  const today = useToday() ?? FALLBACK_TODAY;
  const zoom = prefs.zoom ?? "month";
  const ppd = PPD[zoom];
  const scrollRef = useRef<HTMLDivElement>(null);
  const cornerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [ghost, setGhost] = useState<{ id: string; day: string } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [port, setPort] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setPort({
          left: el.scrollLeft,
          width: el.clientWidth - (cornerRef.current?.offsetWidth ?? 300),
        }),
      );
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", read);
      ro.disconnect();
    };
  }, []);

  const rows = useMemo(
    () =>
      customGroups
        ? customGroups.flatMap((g) => g.rows)
        : statuses.flatMap((s) => state.columns[s.id].map((id) => state.tasks[id])).filter((t) => t && visible(t)),
    [state, visible, customGroups],
  );

  const order = (a: Task, b: Task) => {
    const ra = span(a);
    const rb = span(b);
    if (!ra || !rb) return ra ? -1 : rb ? 1 : 0;
    return ra.s.localeCompare(rb.s) || ra.d.localeCompare(rb.d);
  };

  const groups = useMemo(() => {
    if (!rows.length) return [];
    if (customGroups)
      return customGroups.filter((g) => g.rows.length).map((g) => ({ ...g, rows: [...g.rows].sort(order), patch: {} }));
    const sorted = [...rows].sort(order);
    if (prefs.grouping === "none")
      return [
        {
          key: "t:all",
          title: "",
          icon: null as React.ReactNode,
          rows: sorted,
          patch: {},
        },
      ];
    const field = prefs.grouping;
    return fieldOptions[field]
      .map((o) => ({
        key: `t:${field}:${o.value}`,
        title: o.label,
        icon: o.icon,
        rows: sorted.filter((t) => valueOf(t, field)[0] === o.value),
        patch: patchFor(field, o.value),
      }))
      .filter((g) => g.rows.length);
  }, [rows, prefs.grouping, customGroups]);

  const { first, days } = useMemo(() => {
    const dates = (readOnly ? rows : Object.values(state.tasks)).flatMap(
      (t) => [t.start, t.due].filter(Boolean) as string[],
    );
    const lo = [...dates, addMonths(today, -3)].sort()[0];
    const hi = [...dates, addMonths(today, 9)].sort().at(-1)!;
    const start = addDays(monthStart(lo), -weekday(monthStart(lo)));
    const end = addDays(monthEnd(hi), 7);
    return { first: start, days: diffDays(start, end) + 1 };
  }, [state.tasks, rows, readOnly, today]);

  const width = days * ppd;
  const x = (iso: string) => diffDays(first, iso) * ppd;
  const dayAt = (clientX: number, el: HTMLElement) =>
    addDays(first, Math.max(0, Math.floor((clientX - el.getBoundingClientRect().left) / ppd)));

  const scrollToToday = () => {
    const el = scrollRef.current;
    const left = cornerRef.current?.offsetWidth ?? 300;
    el?.scrollTo({
      left: Math.max(0, x(today) - (el.clientWidth - left) * 0.3),
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const left = cornerRef.current?.offsetWidth ?? 300;
    el.scrollLeft = Math.max(0, diffDays(first, today) * ppd - (el.clientWidth - left) * 0.3);
  }, [first, ppd, today]);

  const months = useMemo(() => {
    const list: { iso: string; from: string; to: string }[] = [];
    for (let m = monthStart(first); m <= addDays(first, days - 1); m = addMonths(m, 1)) {
      const from = m < first ? first : m;
      const end = monthEnd(m);
      const last = addDays(first, days - 1);
      list.push({ iso: m, from, to: end > last ? last : end });
    }
    return list;
  }, [first, days]);

  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => addDays(first, i)), [first, days]);

  const startDrag = (e: React.PointerEvent<HTMLElement>, t: Task, mode: DragMode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    let dx = 0;
    const move = (ev: PointerEvent) => {
      dx = ev.clientX - x0;
      setDrag({ id: t.id, mode, days: Math.round(dx / ppd) });
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setDrag(null);
      const moved = Math.round(dx / ppd);
      if (Math.abs(dx) < 4 && mode === "move") return onOpen(t.id);
      if (moved) commit(t, shifted(t, mode, moved));
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const commit = (t: Task, patch: Pick<Task, "start" | "due">) => {
    const s = patch.start ?? t.start;
    const d = patch.due ?? t.due;
    dispatch({
      type: "update",
      id: t.id,
      patch,
      note:
        s && d && s !== d ? `scheduled it ${formatDue(s)} – ${formatDue(d)}` : `scheduled it for ${formatDue(d ?? s)}`,
    });
  };

  const onBarKey = (e: React.KeyboardEvent, t: Task) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(t.id);
    } else if (step) {
      e.preventDefault();
      commit(t, shifted(t, e.shiftKey ? "end" : "move", step * (e.altKey ? 7 : 1)));
    }
  };

  const unscheduled = rows.filter((t) => !span(t)).length;
  const toggle = (key: string) =>
    setPrefs({
      collapsed: prefs.collapsed.includes(key) ? prefs.collapsed.filter((k) => k !== key) : [...prefs.collapsed, key],
    });

  let n = 0;

  return (
    <div className="@container h-full">
      <div
        ref={scrollRef}
        className="relative h-full overflow-auto overscroll-contain [--left:min(300px,44cqw)]"
        onPointerLeave={() => setGhost(null)}
      >
        <div className="relative min-h-full" style={{ width: `calc(var(--left) + ${width}px)` }}>
          <div className="sticky top-0 z-30 flex h-14 border-b border-line-strong bg-surface">
            <div
              ref={cornerRef}
              className="sticky left-0 z-10 flex w-[var(--left)] shrink-0 flex-col justify-center gap-1.5 border-r border-line-strong bg-surface px-3"
            >
              <div className="flex items-center gap-2">
                <div role="radiogroup" aria-label="Zoom" className="flex border border-line-strong">
                  {(["month", "quarter", "year"] as Zoom[]).map((z) => (
                    <button
                      key={z}
                      role="radio"
                      aria-checked={zoom === z}
                      aria-label={z}
                      onClick={() => setPrefs({ zoom: z })}
                      className={cn(
                        "h-6 border-r border-line-strong px-2 font-mono text-[11px] capitalize outline-none last:border-r-0 focus-visible:ring-2 focus-visible:ring-lapis",
                        zoom === z ? accentFill[accent] : "bg-raised text-ink-2 hover:bg-sunken",
                      )}
                    >
                      <span className="@max-lg:hidden">{z}</span>
                      <span className="@lg:hidden">{z[0]}</span>
                    </button>
                  ))}
                </div>
                <Button size="sm" variant="ghost" onClick={() => scrollToToday()} className="h-6 px-2 @max-lg:px-1.5">
                  Today
                </Button>
              </div>
              <p className="truncate font-mono text-[11px] text-ink-3">
                {readOnly
                  ? `${rows.length} scheduled`
                  : `${rows.length} tasks${unscheduled ? ` · ${unscheduled} without dates` : ""}`}
              </p>
            </div>

            <div className="relative shrink-0" style={{ width }}>
              {zoom === "year"
                ? [...new Set(months.map((m) => m.iso.slice(0, 4)))].map((y) => {
                    const from = months.find((m) => m.iso.startsWith(y))!.from;
                    const to = [...months].reverse().find((m) => m.iso.startsWith(y))!.to;
                    return (
                      <div
                        key={y}
                        className="absolute top-0 h-7 border-l border-line"
                        style={{
                          left: x(from),
                          width: (diffDays(from, to) + 1) * ppd,
                        }}
                      >
                        <span className="sticky left-[calc(var(--left)+8px)] inline-block px-2 pt-1.5 font-display text-sm">
                          {y}
                        </span>
                      </div>
                    );
                  })
                : months.map((m) => (
                    <div
                      key={m.iso}
                      className="absolute top-0 h-7 border-l border-line"
                      style={{
                        left: x(m.from),
                        width: (diffDays(m.from, m.to) + 1) * ppd,
                      }}
                    >
                      <span className="sticky left-[calc(var(--left)+8px)] inline-block px-2 pt-1.5 font-display text-sm whitespace-nowrap">
                        {MONTHS[parts(m.iso).m]} {parts(m.iso).y}
                      </span>
                    </div>
                  ))}
              <div className="absolute inset-x-0 top-7 h-7 font-mono text-[11px] text-ink-3">
                {zoom === "month"
                  ? dayList.map((d) => (
                      <span
                        key={d}
                        className={cn(
                          "absolute top-0 grid h-7 place-items-center",
                          d === today ? "font-medium text-pyrite-ink" : weekday(d) > 4 ? "text-ink-3/60" : "",
                        )}
                        style={{ left: x(d), width: ppd }}
                      >
                        {parts(d).d}
                      </span>
                    ))
                  : zoom === "quarter"
                    ? dayList
                        .filter((d) => weekday(d) === 0)
                        .map((d) => (
                          <span key={d} className="absolute top-0 flex h-7 items-center pl-1" style={{ left: x(d) }}>
                            {parts(d).d}
                          </span>
                        ))
                    : months.map((m) => (
                        <span
                          key={m.iso}
                          className="absolute top-0 flex h-7 items-center pl-2"
                          style={{ left: x(m.from) }}
                        >
                          {MONTHS[parts(m.iso).m].slice(0, 3)}
                        </span>
                      ))}
              </div>
              <div
                className="absolute top-7 bottom-0 z-10 flex flex-col items-center"
                style={{ left: x(today) + ppd / 2 - 1 }}
              >
                <span className="h-full w-0.5 bg-pyrite" />
              </div>
              <span
                className="absolute top-[22px] z-10 size-2 -translate-x-1/2 bg-pyrite"
                style={{ left: x(today) + ppd / 2 }}
              />
            </div>
          </div>

          <div className="relative">
            <div
              aria-hidden
              className={cn("pointer-events-none absolute inset-y-0 left-[var(--left)]", !rows.length && "hidden")}
              style={{ width }}
            >
              {zoom !== "year"
                ? dayList
                    .filter((d) => weekday(d) === 5)
                    .map((d) => (
                      <DitherFill
                        key={d}
                        level={12}
                        tone="line"
                        className="absolute inset-y-0"
                        style={{ left: x(d), width: 2 * ppd }}
                      />
                    ))
                : null}
              {(zoom === "month" ? dayList.filter((d) => weekday(d) === 0) : []).map((d) => (
                <span key={d} className="absolute inset-y-0 w-px bg-line/70" style={{ left: x(d) }} />
              ))}
              {months.map((m) => (
                <span key={m.iso} className="absolute inset-y-0 w-px bg-line-strong/70" style={{ left: x(m.from) }} />
              ))}
              <span className="absolute inset-y-0 z-20 w-0.5 bg-pyrite" style={{ left: x(today) + ppd / 2 - 1 }} />
            </div>

            {groups.map((g) => {
              const collapsed = prefs.collapsed.includes(g.key);
              const pts = g.rows.reduce((sum, t) => sum + (t.size ? sizePoints[t.size] : 0), 0);
              const spans = g.rows.map(span).filter(Boolean) as {
                s: string;
                d: string;
              }[];
              const lo = spans.map((r) => r.s).sort()[0];
              const hi = spans
                .map((r) => r.d)
                .sort()
                .at(-1);
              return (
                <Fragment key={g.key}>
                  {g.title ? (
                    <div className="flex h-9 border-b border-line bg-sunken/70">
                      <div className="sticky left-0 z-10 flex w-[var(--left)] shrink-0 items-center gap-2.5 border-r border-line bg-sunken px-3">
                        <button
                          aria-expanded={!collapsed}
                          onClick={() => toggle(g.key)}
                          className="flex min-w-0 items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-lapis"
                        >
                          <PixelCaret
                            className={cn("shrink-0 text-ink-3 transition-transform", collapsed && "-rotate-90")}
                          />
                          {g.icon}
                          <span className="truncate text-sm font-medium">{g.title}</span>
                        </button>
                        <span className="font-mono text-[11px] text-ink-3">{g.rows.length}</span>
                        {pts && !readOnly ? <span className="font-mono text-[11px] text-ink-3">· {pts} pt</span> : null}
                      </div>
                      <div className="relative shrink-0" style={{ width }}>
                        {lo && hi ? (
                          <Tooltip content={`${g.title}: ${formatShort(lo, today)} – ${formatShort(hi, today)}`}>
                            <span
                              className="absolute top-1/2 h-1.5 -translate-y-1/2 border border-ink-3"
                              style={{
                                left: x(lo),
                                width: (diffDays(lo, hi) + 1) * ppd,
                              }}
                            >
                              <DitherFill level={50} tone="muted" className="absolute inset-0" />
                            </span>
                          </Tooltip>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {collapsed
                    ? null
                    : g.rows.map((t) => {
                        n += 1;
                        const r = span(t);
                        const live = drag?.id === t.id && r ? { ...r, ...shiftedSpan(t, drag) } : r;
                        const row = (
                          <div key={t.id} className="group/row flex h-10">
                            <div className="sticky left-0 z-10 flex w-[var(--left)] shrink-0 items-center gap-2.5 border-r border-b border-line bg-raised pr-2 pl-3 group-hover/row:bg-surface">
                              {lead ? (
                                lead(t)
                              ) : (
                                <span className="w-5 shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">{n}</span>
                              )}
                              <StatusMarker status={t.status} />
                              <button
                                tabIndex={r ? -1 : 0}
                                onClick={() => onOpen(t.id)}
                                className={cn(
                                  "min-w-0 truncate text-left text-sm outline-none hover:text-lapis focus-visible:ring-2 focus-visible:ring-lapis",
                                  t.status === "done" && "text-ink-2",
                                )}
                              >
                                {t.title}
                              </button>
                              {readOnly ? null : (
                                <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-3">{t.id}</span>
                              )}
                            </div>
                            <div
                              className="relative shrink-0 border-b border-line group-hover/row:bg-ink/[0.025]"
                              style={{ width }}
                              onPointerMove={(e) => {
                                if (r || drag || readOnly) return;
                                const day = dayAt(e.clientX, e.currentTarget);
                                if (ghost?.id !== t.id || ghost.day !== day) setGhost({ id: t.id, day });
                              }}
                              onPointerLeave={() => ghost?.id === t.id && setGhost(null)}
                              onClick={(e) => {
                                if (r || readOnly) return;
                                const day = dayAt(e.clientX, e.currentTarget);
                                commit(t, {
                                  start: day,
                                  due: addDays(day, SPAN[zoom] - 1),
                                });
                                setGhost(null);
                              }}
                            >
                              {live && port.width && x(live.d) + ppd < port.left ? (
                                <EdgePointer
                                  side="left"
                                  at={port.left}
                                  label={formatShort(live.d, today)}
                                  onClick={() =>
                                    scrollRef.current?.scrollTo({
                                      left: Math.max(0, x(live.s) - 48),
                                      behavior: "smooth",
                                    })
                                  }
                                />
                              ) : live && port.width && x(live.s) > port.left + port.width ? (
                                <EdgePointer
                                  side="right"
                                  at={port.left + port.width}
                                  label={formatShort(live.s, today)}
                                  onClick={() =>
                                    scrollRef.current?.scrollTo({
                                      left: Math.max(0, x(live.s) - 48),
                                      behavior: "smooth",
                                    })
                                  }
                                />
                              ) : null}
                              {live ? (
                                <Bar
                                  task={t}
                                  from={live.s}
                                  to={live.d}
                                  milestone={!t.start}
                                  x={x}
                                  ppd={ppd}
                                  today={today}
                                  dragging={drag?.id === t.id}
                                  readOnly={readOnly}
                                  accent={accent}
                                  onOpen={() => onOpen(t.id)}
                                  onPointerDown={(e, mode) => startDrag(e, t, mode)}
                                  onKeyDown={(e) => onBarKey(e, t)}
                                />
                              ) : ghost?.id === t.id ? (
                                <span
                                  className="pointer-events-none absolute top-1.5 flex h-7 items-center gap-1.5 border border-dashed border-lapis bg-lapis-soft/60 px-2 text-xs whitespace-nowrap text-lapis-ink"
                                  style={{
                                    left: x(ghost.day),
                                    width: Math.max(SPAN[zoom] * ppd - 2, 96),
                                  }}
                                >
                                  <Icon name="plus" size="sm" /> Schedule
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                        return readOnly ? (
                          row
                        ) : (
                          <TaskMenu key={t.id} task={t} dispatch={dispatch} onOpen={onOpen}>
                            {row}
                          </TaskMenu>
                        );
                      })}

                  {collapsed || readOnly ? null : (
                    <div className="flex h-9">
                      <div className="sticky left-0 z-10 w-[var(--left)] shrink-0 border-r border-b border-line bg-raised">
                        {adding === g.key ? (
                          <AddInput
                            label={g.title ? `Add to ${g.title}` : "Add a task"}
                            onAdd={(title) =>
                              dispatch({
                                type: "add",
                                status: "todo",
                                title,
                                patch: g.patch,
                              })
                            }
                            onClose={() => setAdding(null)}
                          />
                        ) : (
                          <button
                            onClick={() => setAdding(g.key)}
                            className="flex h-full w-full items-center gap-2.5 px-3 text-left text-sm text-ink-3 hover:bg-surface hover:text-ink"
                          >
                            <Icon name="plus" size="sm" className="w-5" /> Add item
                          </button>
                        )}
                      </div>
                      <div className="shrink-0 border-b border-line" style={{ width }} />
                    </div>
                  )}
                </Fragment>
              );
            })}

            {rows.length === 0 ? (
              <div className="sticky left-0 w-[100cqw]">
                <EmptyState
                  art="terrain-badlands-strata"
                  title={filtered ? "Nothing matches" : readOnly ? "Nothing scheduled yet" : "Nothing to plan yet"}
                  body={
                    filtered
                      ? "No task fits the search and filters."
                      : readOnly
                        ? "Check back soon."
                        : "Add a task, then drag it onto the timeline."
                  }
                  action={
                    filtered ? (
                      <Button size="sm" onClick={onClearFilters}>
                        <Icon name="x" size="sm" /> Clear search and filters
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function shiftedSpan(t: Task, drag: Drag) {
  const next = shifted(t, drag.mode, drag.days);
  const s = next.start ?? next.due!;
  const d = next.due ?? next.start!;
  return { s, d };
}

function Bar({
  task,
  from,
  to,
  milestone,
  x,
  ppd,
  today,
  dragging,
  readOnly,
  accent,
  onOpen,
  onPointerDown,
  onKeyDown,
}: {
  task: Task;
  from: string;
  to: string;
  milestone: boolean;
  x: (iso: string) => number;
  ppd: number;
  today: string;
  dragging: boolean;
  readOnly?: boolean;
  accent: "lapis" | "pyrite" | "malachite" | "hematite";
  onOpen: () => void;
  onPointerDown: (e: React.PointerEvent<HTMLElement>, mode: DragMode) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const ring = {
    lapis: "focus-visible:ring-lapis",
    pyrite: "focus-visible:ring-pyrite",
    malachite: "focus-visible:ring-malachite",
    hematite: "focus-visible:ring-hematite",
  }[accent];
  const press = readOnly
    ? { onClick: onOpen }
    : {
        onPointerDown: (e: React.PointerEvent<HTMLElement>) => onPointerDown(e, "move"),
        onKeyDown,
      };
  const style = look[task.status];
  const person = personById(task.assignee);
  const done = task.subtasks.filter((s) => s.done).length;
  const total = task.subtasks.length;
  const overdue = task.status !== "done" && to < today;
  const left = x(from);
  const w = Math.max(ppd, (diffDays(from, to) + 1) * ppd) - 2;
  const label = `${task.title}, ${from === to ? formatDue(to) : `${formatDue(from)} to ${formatDue(to)}`}`;
  const inside = w >= 120;

  if (milestone) {
    return (
      <div className="absolute top-0 flex h-10 items-center" style={{ left: left + ppd / 2 - 7 }}>
        <button
          aria-label={`${label}. Due date only`}
          {...press}
          className={cn(
            "relative size-3.5 rotate-45 border outline-none focus-visible:ring-2",
            readOnly ? "cursor-pointer" : "cursor-grab touch-none",
            ring,
            style.border,
            overdue ? "bg-hematite" : "bg-raised",
          )}
        >
          <DitherFill level={50} tone={style.tone} className="absolute inset-0.5" />
        </button>
        <span className="pointer-events-none ml-2.5 text-xs whitespace-nowrap text-ink-2">{task.title}</span>
      </div>
    );
  }

  return (
    <div className="absolute top-1.5 flex h-7 items-center" style={{ left: left + 1 }}>
      <button
        aria-label={label}
        {...press}
        style={{ width: w }}
        className={cn(
          "group/bar relative flex h-7 items-center overflow-clip border bg-raised text-left outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-page",
          readOnly ? "cursor-pointer hover:bg-surface" : "cursor-grab touch-none",
          ring,
          style.border,
          dragging && "cursor-grabbing shadow-[3px_3px_0_var(--line-strong)]",
          task.status === "done" && "bg-surface",
        )}
      >
        <span className={cn("absolute inset-y-0 left-0 w-1", style.cap)} />
        {overdue ? <span className="absolute inset-y-0 right-0 w-1 bg-hematite" /> : null}
        {total ? (
          <span
            className="absolute bottom-0 left-1 h-0.5"
            style={{ width: `calc((100% - 0.25rem) * ${done / total})` }}
          >
            <DitherFill level={75} tone={style.tone} className="absolute inset-0" />
          </span>
        ) : null}
        {inside ? (
          <span className="flex min-w-0 flex-1 items-center gap-2 pr-1.5 pl-3">
            <span
              className={cn(
                "sticky left-[calc(var(--left)+12px)] min-w-0 truncate text-xs",
                task.status === "done" && "text-ink-2",
              )}
            >
              {task.title}
            </span>
            {person && w >= 180 ? (
              <Avatar name={person.name} src={person.avatar} tone={person.tone} size="xs" className="ml-auto" />
            ) : null}
          </span>
        ) : null}
        {readOnly ? null : (
          <>
            <span
              aria-hidden
              onPointerDown={(e) => onPointerDown(e, "start")}
              className="absolute inset-y-0 left-0 w-2 cursor-ew-resize opacity-0 group-hover/bar:opacity-100"
            >
              <span className="absolute inset-y-1.5 left-0.5 w-px bg-ink-2" />
            </span>
            <span
              aria-hidden
              onPointerDown={(e) => onPointerDown(e, "end")}
              className="absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover/bar:opacity-100"
            >
              <span className="absolute inset-y-1.5 right-0.5 w-px bg-ink-2" />
            </span>
          </>
        )}
      </button>
      {inside ? null : (
        <span className="pointer-events-none ml-2 text-xs whitespace-nowrap text-ink-2">{task.title}</span>
      )}
      {dragging ? (
        <span className="pointer-events-none absolute -top-6 left-0 bg-ink px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-page">
          {from === to ? formatDue(to) : `${formatDue(from)} – ${formatDue(to)}`}
        </span>
      ) : null}
    </div>
  );
}

function EdgePointer({
  side,
  at,
  label,
  onClick,
}: {
  side: "left" | "right";
  at: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`Scroll to ${label}`}
      className={cn(
        "absolute top-2.5 z-[5] flex h-5 items-center gap-1 border border-line-strong bg-raised px-1.5 font-mono text-[10px] text-ink-2 hover:border-ink-3 hover:text-ink",
        side === "right" && "-translate-x-full",
      )}
      style={{ left: side === "left" ? at + 6 : at - 6 }}
    >
      {side === "left" ? <Icon name="arrow-left" size="sm" /> : null}
      {label}
      {side === "right" ? <Icon name="arrow-right" size="sm" /> : null}
    </button>
  );
}

function AddInput({ label, onAdd, onClose }: { label: string; onAdd: (title: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    if (draft.trim()) onAdd(draft.trim());
    setDraft("");
  };
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") {
          setDraft("");
          onClose();
        }
      }}
      onBlur={() => {
        submit();
        onClose();
      }}
      placeholder="Task title, then Enter"
      aria-label={label}
      className="h-full w-full bg-raised px-3 text-sm shadow-[inset_0_0_0_2px_var(--lapis)] outline-none placeholder:text-ink-3"
    />
  );
}
