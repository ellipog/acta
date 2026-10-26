"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { DitherFill } from "./dither";
import { Popover, PopoverContent, PopoverTrigger } from "./overlays";
import { PixelArrow, PixelCaret } from "./pixel";
import { MONTHS, addDays, addMonths, localToday, pad, parts, toIso, weekday } from "@/lib/dates";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

// Null while prerendering
export function useToday() {
  return useSyncExternalStore(
    () => () => {},
    localToday,
    () => null,
  );
}

export function formatDate(iso?: string) {
  if (!iso) return "";
  const { y, m, d } = parts(iso);
  return `${MONTHS[m].slice(0, 3)} ${d}, ${y}`;
}

export function formatShort(iso: string, today: string | null) {
  const { y, m, d } = parts(iso);
  const sameYear = today ? parts(today).y === y : true;
  return `${MONTHS[m].slice(0, 3)} ${d}${sameYear ? "" : `, ${y}`}`;
}

export function dueState(iso: string | undefined, today: string | null): "overdue" | "today" | "soon" | "later" | null {
  if (!iso || !today) return null;
  if (iso < today) return "overdue";
  if (iso === today) return "today";
  return iso <= addDays(today, 7) ? "soon" : "later";
}

type View = "days" | "months" | "years";

export function Calendar({
  value,
  onSelect,
  autoFocus,
}: {
  value?: string;
  onSelect: (iso: string | undefined) => void;
  autoFocus?: boolean;
}) {
  const today = useToday();
  const [picked, setFocus] = useState<string | null>(value ?? null);
  const focus = picked ?? today ?? "2000-01-01";
  const [view, setView] = useState<View>("days");
  const [page, setPage] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const keyboard = useRef(Boolean(autoFocus));

  useEffect(() => {
    if (!keyboard.current) return;
    gridRef.current?.querySelector<HTMLButtonElement>("[tabindex='0']")?.focus();
  }, [focus, view]);

  const { y, m, d: day } = parts(focus);
  const first = `${y}-${pad(m + 1)}-01`;
  const start = addDays(first, -weekday(first));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const [lo, hi] = !value || !today ? ["", ""] : value > today ? [today, value] : [value, today];
  const sel = value ? parts(value) : null;
  const now = today ? parts(today) : null;

  const goTo = (year: number, month: number) => {
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    setFocus(toIso(new Date(Date.UTC(year, month, Math.min(day, last)))));
  };

  const step = { days: [-1, 1], months: [-12, 12], years: [-144, 144] }[view];
  const shift = (dir: 0 | 1) => {
    if (view === "years") setPage((p) => p + (dir ? 12 : -12));
    setFocus(addMonths(focus, step[dir]));
  };
  const openYears = () => {
    setPage(y - 4);
    setView("years");
  };

  const onDayKey = (e: React.KeyboardEvent) => {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1),
      Home: () => addDays(focus, -weekday(focus)),
      End: () => addDays(focus, 6 - weekday(focus)),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    keyboard.current = true;
    setFocus(move());
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key];
    if (!delta) return;
    e.preventDefault();
    keyboard.current = true;
    const next = addMonths(focus, view === "months" ? delta : delta * 12);
    if (view === "years") {
      const ny = parts(next).y;
      if (ny < page) setPage(page - 12);
      else if (ny > page + 11) setPage(page + 12);
    } else if (parts(next).y !== y) return;
    setFocus(next);
  };

  const quick: [string, string][] = today
    ? [
        ["Today", today],
        ["Tomorrow", addDays(today, 1)],
        ["Next Monday", addDays(today, 7 - weekday(today))],
        ["In 2 weeks", addDays(today, 14)],
      ]
    : [];

  const cell =
    "relative grid place-items-center outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-lapis focus-visible:ring-inset";
  const headerButton =
    "flex h-7 items-center gap-1.5 px-1.5 font-display text-base outline-none hover:bg-sunken focus-visible:ring-2 focus-visible:ring-lapis";

  return (
    <div className={cn("w-[17rem] select-none", !picked && !today && "invisible")}>
      <div className="flex items-center justify-between border-b border-line px-2 py-2">
        <button
          aria-label={{ days: "Previous month", months: "Previous year", years: "Previous years" }[view]}
          onClick={() => shift(0)}
          className="grid size-7 place-items-center text-ink-2 hover:bg-sunken hover:text-ink"
        >
          <PixelArrow dir="left" />
        </button>
        <div className="flex items-center" aria-live="polite">
          {view === "years" ? (
            <span className="px-1.5 font-display text-base">
              {page} – {page + 11}
            </span>
          ) : (
            <>
              {view === "days" ? (
                <button aria-label={`${MONTHS[m]}, choose a month`} onClick={() => setView("months")} className={headerButton}>
                  {MONTHS[m]}
                </button>
              ) : null}
              <button
                aria-label={`${y}, choose a year`}
                onClick={openYears}
                className={cn(headerButton, view === "days" ? "text-ink-3 hover:text-ink" : "text-ink")}
              >
                {y}
                <PixelCaret className="text-ink-3" />
              </button>
            </>
          )}
        </div>
        <button
          aria-label={{ days: "Next month", months: "Next year", years: "Next years" }[view]}
          onClick={() => shift(1)}
          className="grid size-7 place-items-center text-ink-2 hover:bg-sunken hover:text-ink"
        >
          <PixelArrow />
        </button>
      </div>

      {view === "days" ? (
        <div className="px-2 pt-2 pb-1">
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((w) => (
              <span key={w} className="grid h-6 place-items-center font-mono text-[10px] text-ink-3">
                {w}
              </span>
            ))}
          </div>
          <div ref={gridRef} role="grid" aria-label={`${MONTHS[m]} ${y}`} onKeyDown={onDayKey} className="grid grid-cols-7">
            {days.map((d) => {
              const inMonth = parts(d).m === m;
              const selected = d === value;
              const between = d > lo && d < hi;
              return (
                <button
                  key={d}
                  role="gridcell"
                  aria-selected={selected}
                  aria-label={formatDate(d)}
                  tabIndex={d === focus ? 0 : -1}
                  onClick={() => {
                    setFocus(d);
                    onSelect(d);
                  }}
                  className={cn(
                    cell,
                    "h-8 font-mono text-xs",
                    inMonth ? (weekday(d) > 4 ? "text-ink-2" : "text-ink") : "text-ink-3/50",
                    selected ? "bg-lapis text-on-accent" : "hover:bg-sunken",
                  )}
                >
                  {between ? <DitherFill level={12} tone="lapis" className="absolute inset-0" /> : null}
                  <span className="relative">{parts(d).d}</span>
                  {d === today ? (
                    <span className={cn("absolute inset-x-2.5 bottom-1 h-[2px]", selected ? "bg-on-accent" : "bg-pyrite")} />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          ref={gridRef}
          role="grid"
          aria-label={view === "months" ? `Months of ${y}` : `Years ${page} to ${page + 11}`}
          onKeyDown={onGridKey}
          className="grid grid-cols-3 gap-px p-2"
        >
          {Array.from({ length: 12 }, (_, i) => {
            const isMonths = view === "months";
            const n = isMonths ? i : page + i;
            const focused = isMonths ? n === m : n === y;
            const selected = sel ? (isMonths ? sel.y === y && sel.m === n : sel.y === n) : false;
            const current = now ? (isMonths ? now.y === y && now.m === n : now.y === n) : false;
            return (
              <button
                key={n}
                role="gridcell"
                aria-selected={selected}
                tabIndex={focused ? 0 : -1}
                onClick={() => {
                  if (isMonths) {
                    goTo(y, n);
                    setView("days");
                  } else {
                    goTo(n, m);
                    setView("months");
                  }
                }}
                className={cn(
                  cell,
                  "h-[3.25rem] text-sm",
                  isMonths ? "" : "font-mono text-[13px]",
                  selected ? "bg-lapis text-on-accent" : focused ? "bg-sunken" : "hover:bg-sunken",
                )}
              >
                {isMonths ? MONTHS[n].slice(0, 3) : n}
                {current ? (
                  <span className={cn("absolute inset-x-6 bottom-2 h-[2px]", selected ? "bg-on-accent" : "bg-pyrite")} />
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-t border-line p-2">
        {quick.map(([label, d]) => (
          <button
            key={label}
            onClick={() => {
              setFocus(d);
              setView("days");
              onSelect(d);
            }}
            className={cn(
              "h-6 border px-1.5 text-[11px]",
              d === value ? "border-lapis bg-lapis-soft text-lapis-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
        {value ? (
          <button onClick={() => onSelect(undefined)} className="ml-auto h-6 px-1.5 text-[11px] text-ink-3 hover:text-hematite">
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

const triggers = {
  field:
    "h-9 w-full border border-line-strong bg-raised px-3 text-sm hover:border-ink-3 focus-visible:border-lapis focus-visible:ring-2 focus-visible:ring-lapis/25",
  ghost: "h-8 w-full border border-transparent px-1.5 text-sm hover:border-line-strong focus-visible:border-lapis",
  cell: "h-full w-full px-3 text-sm",
};

const dueTone = {
  overdue: "text-hematite",
  today: "text-pyrite-ink",
  soon: "text-ink",
  later: "text-ink",
};

export function DatePicker({
  value,
  onChange,
  placeholder = "No date",
  variant = "field",
  due,
  id,
  className,
  tabIndex,
  "aria-label": ariaLabel,
}: {
  value?: string;
  onChange: (iso: string | undefined) => void;
  placeholder?: string;
  variant?: keyof typeof triggers;
  due?: boolean;
  id?: string;
  className?: string;
  tabIndex?: number;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const today = useToday();
  const state = due ? dueState(value, today) : null;
  const cell = variant === "cell";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        className={cn(
          "group flex min-w-0 items-center gap-2 text-left outline-none transition-colors data-[state=open]:border-lapis",
          triggers[variant],
          className,
        )}
      >
        {cell && !value ? null : (
          <Icon name="calendar" size="sm" className={cn("shrink-0", state === "overdue" ? "text-hematite" : "text-ink-3")} />
        )}
        <span
          className={cn(
            "flex-1 truncate",
            value ? cn("font-mono text-[13px]", state ? dueTone[state] : "text-ink") : "text-ink-3",
          )}
        >
          {value ? (cell ? formatShort(value, today) : formatDate(value)) : placeholder}
          {state === "overdue" && !cell ? <span className="ml-1.5 font-sans text-[11px]">Overdue</span> : null}
          {state === "today" ? <span className="ml-1.5 font-sans text-[11px]">Today</span> : null}
        </span>
        <PixelCaret
          className={cn(
            "text-ink-3 group-data-[state=open]:rotate-180",
            cell && "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:opacity-100",
          )}
        />
      </PopoverTrigger>
      <PopoverContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <Calendar
          autoFocus
          value={value}
          onSelect={(d) => {
            onChange(d);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function DueLabel({ due, done, className }: { due: string; done?: boolean; className?: string }) {
  const today = useToday();
  const state = done ? null : dueState(due, today);
  return (
    <span className={cn("flex items-center gap-1 font-mono", state ? dueTone[state] : "", state === "soon" && "text-ink-2", className)}>
      <Icon name="calendar" size="sm" />
      {state === "today" ? "Today" : formatShort(due, today)}
    </span>
  );
}
