"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { SubtaskCells } from "@/components/board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/controls";
import { Calendar, DatePicker, dueState, useToday } from "@/components/ui/date-picker";
import { Avatar, AvatarStack, EmptyState } from "@/components/ui/display";
import { DitherFill, type DitherTone } from "@/components/ui/dither";
import { Icon } from "@/components/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from "@/components/ui/overlays";
import { PixelCaret } from "@/components/ui/pixel";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useNow } from "@/lib/hooks";
import {
  formatDue,
  labels,
  labelTone,
  personById,
  sizePoints,
  statuses,
  statusTitle,
  timeAgo,
  updatedAt,
  type BoardAction,
  type BoardState,
  type Person,
  type StatusCategory,
  type Task,
} from "@/lib/board-store";
import { cn } from "@/lib/utils";
import {
  columnMeta,
  compare,
  fieldLabel,
  fieldOptions,
  noteFor,
  patchFor,
  valueOf,
  type ColumnId,
  type ColumnPref,
  type GroupField,
  type Prefs,
  type SortKey,
} from "./fields";
import { FieldsMenu } from "./fields-menu";
import { TaskMenu } from "./task-menu";

type Group = {
  key: string;
  title: string;
  icon?: React.ReactNode;
  rows: Task[];
  patch: Partial<Task>;
};

const GUTTER = 44;
const TRAIL = 44;
const TITLE_MAX = "62vw";

const statusTone: Record<StatusCategory, DitherTone> = {
  backlog: "line",
  todo: "muted",
  in_progress: "pyrite",
  review: "lapis",
  done: "malachite",
};

const selectFields = ["status", "assignee", "priority", "size", "project"] as const satisfies readonly GroupField[];
const isSelectField = (c: ColumnId): c is (typeof selectFields)[number] => (selectFields as readonly string[]).includes(c);

export function TableView({
  state,
  dispatch,
  visible,
  onOpen,
  prefs,
  setPrefs,
  filtered,
  onClearFilters,
}: {
  state: BoardState;
  dispatch: (a: BoardAction) => void;
  visible: (t: Task) => boolean;
  onOpen: (id: string) => void;
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  filtered: boolean;
  onClearFilters: () => void;
}) {
  const { grouping, sort } = prefs;
  const today = useToday();
  const now = useNow();
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(null);

  const [active, setActive] = useState<{ row: string; col: ColumnId } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [resize, setResize] = useState<{ id: ColumnId; width: number } | null>(null);
  const [scrolledX, setScrolledX] = useState(false);

  const rows = useMemo(() => {
    const all = statuses.flatMap((s) => state.columns[s.id].map((id) => state.tasks[id])).filter((t) => t && visible(t));
    return sort ? [...all].sort((a, b) => compare[sort.key](a, b) * sort.dir) : all;
  }, [state, visible, sort]);

  const groups = useMemo<Group[]>(() => {
    if (!rows.length && filtered) return [];
    if (grouping === "none") return [{ key: "all", title: "", rows, patch: {} }];
    const filteringThis = grouping !== "size" && (prefs.filters[grouping]?.length ?? 0) > 0;
    return fieldOptions[grouping]
      .map((o) => ({
        key: `${grouping}:${o.value}`,
        title: o.label,
        icon: o.icon,
        rows: rows.filter((r) => valueOf(r, grouping)[0] === o.value),
        patch: patchFor(grouping, o.value),
      }))
      .filter((g) => g.rows.length || (grouping === "status" && !filteringThis));
  }, [rows, grouping, prefs.filters, filtered]);

  const isCollapsed = (g: Group) => prefs.collapsed.includes(g.key);
  const navRows = groups.flatMap((g) => (isCollapsed(g) ? [] : g.rows.map((r) => r.id)));
  const rowIndex = new Map(navRows.map((id, i) => [id, i]));

  const cols = [
    ...prefs.columns.filter((c) => c.id === "title"),
    ...prefs.columns.filter((c) => c.id !== "title" && !c.hidden),
  ];
  const colIds = cols.map((c) => c.id);
  const widthOf = (c: ColumnPref) => (resize?.id === c.id ? resize.width : c.width);
  const titleWidth = widthOf(cols[0]);
  const restWidth = cols.slice(1).reduce((sum, c) => sum + widthOf(c), 0);
  const titleCss = `min(${titleWidth}px, ${TITLE_MAX})`;
  const stickyWidth = `calc(${GUTTER}px + ${titleCss})`;

  const visibleIds = new Set(rows.map((r) => r.id));
  const sel = selected.filter((id) => visibleIds.has(id));
  const selSet = new Set(sel);

  const cursor =
    active && rowIndex.has(active.row) && colIds.includes(active.col)
      ? active
      : navRows.length
        ? { row: navRows[0], col: "title" as ColumnId }
        : null;
  const tabFor = (row: string, col: ColumnId) => (cursor?.row === row && cursor.col === col ? 0 : -1);

  const setField = (ids: string[], field: GroupField, value: string) => {
    const changed = ids.filter((id) => state.tasks[id] && valueOf(state.tasks[id], field)[0] !== value);
    if (!changed.length) return;
    const patch = patchFor(field, value);
    const note = noteFor(field, value);
    if (changed.length === 1) dispatch({ type: "update", id: changed[0], patch, note });
    else dispatch({ type: "bulk", ids: changed, patch, note });
  };

  const setLabels = (t: Task, next: string[]) => {
    const added = next.find((l) => !t.labels.includes(l));
    const removed = t.labels.find((l) => !next.includes(l));
    dispatch({
      type: "update",
      id: t.id,
      patch: { labels: next },
      note: added ? `added label ${added}` : removed ? `removed label ${removed}` : undefined,
    });
  };

  const setDate = (field: "start" | "due", ids: string[], value: string | undefined) => {
    const name = field === "due" ? "due date" : "start date";
    const note = value ? `set the ${name} to ${formatDue(value)}` : `removed the ${name}`;
    const patch = { [field]: value };
    if (ids.length === 1) dispatch({ type: "update", id: ids[0], patch, note });
    else dispatch({ type: "bulk", ids, patch, note });
  };
  const setDue = (ids: string[], due: string | undefined) => setDate("due", ids, due);

  const rename = (t: Task, title: string) => {
    const next = title.trim();
    if (next && next !== t.title) dispatch({ type: "update", id: t.id, patch: { title: next }, note: "renamed the task" });
  };

  const cellText = (t: Task, col: ColumnId): string => {
    switch (col) {
      case "title":
        return t.title;
      case "status":
        return statusTitle[t.status];
      case "labels":
        return t.labels.join(", ");
      case "due":
      case "start":
        return t[col] ?? "";
      case "subtasks":
        return t.subtasks.length ? `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : "";
      case "updated":
        return now ? timeAgo(updatedAt(t), now) : "";
      default: {
        const v = valueOf(t, col)[0];
        return v === "none" ? "" : (fieldOptions[col].find((o) => o.value === v)?.label ?? "");
      }
    }
  };

  const paste = (row: string, col: ColumnId, text: string) => {
    const ids = selSet.has(row) ? sel : [row];
    const clean = text.trim();
    const fail = () =>
      toast({ icon: "x", title: `Can’t paste into ${columnMeta[col].label}`, description: `“${clean.slice(0, 40)}” isn’t one of its values.` });
    if (col === "title") return rename(state.tasks[row], clean);
    if (col === "due" || col === "start") {
      if (!clean) return setDate(col, ids, undefined);
      return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? setDate(col, ids, clean) : fail();
    }
    if (col === "labels") {
      const wanted = clean.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      const next = labels.filter((l) => wanted.includes(l.id.toLowerCase())).map((l) => l.id);
      if (wanted.length && !next.length) return fail();
      for (const id of ids) setLabels(state.tasks[id], next);
      return;
    }
    if (!isSelectField(col)) return;
    const option = clean
      ? fieldOptions[col].find((o) => o.label.toLowerCase() === clean.toLowerCase() || o.value === clean.toLowerCase())
      : fieldOptions[col].find((o) => o.value === "none");
    if (!option) return fail();
    setField(ids, col, option.value);
  };

  const clear = (row: string, col: ColumnId) => {
    const ids = selSet.has(row) ? sel : [row];
    if (col === "due" || col === "start") setDate(col, ids.filter((id) => state.tasks[id][col]), undefined);
    else if (col === "labels") ids.forEach((id) => state.tasks[id].labels.length && setLabels(state.tasks[id], []));
    else if (isSelectField(col) && col !== "status") setField(ids, col, "none");
  };

  const toggleRow = (id: string, extend: boolean) => {
    if (extend && anchor.current && rowIndex.has(anchor.current)) {
      const [a, b] = [rowIndex.get(anchor.current)!, rowIndex.get(id)!].sort((x, y) => x - y);
      const range = navRows.slice(a, b + 1);
      setSelected([...new Set([...sel, ...range])]);
    } else {
      setSelected(selSet.has(id) ? sel.filter((x) => x !== id) : [...sel, id]);
      anchor.current = id;
    }
  };

  const allChecked = rows.length > 0 && sel.length === rows.length ? true : sel.length ? "indeterminate" : false;

  const focusCell = (row: string, col: ColumnId) => {
    const td = scrollRef.current?.querySelector<HTMLElement>(`td[data-row="${row}"][data-col="${col}"]`);
    if (!td) return;
    const target = td.querySelector<HTMLElement>("button, input") ?? td;
    target.focus({ preventScroll: true });
    td.scrollIntoView({ block: "nearest", inline: "nearest" });
    setActive({ row, col });
  };

  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    const td = (e.target as HTMLElement).closest<HTMLElement>("td[data-col]");
    if (!td || !scrollRef.current?.contains(td) || (e.target as HTMLElement).matches("input, textarea")) return;
    const row = td.dataset.row!;
    const col = td.dataset.col as ColumnId;
    const r = rowIndex.get(row) ?? 0;
    const c = colIds.indexOf(col);
    const mod = e.metaKey || e.ctrlKey;
    const go = (nr: number, nc: number) => {
      const next = navRows[Math.max(0, Math.min(navRows.length - 1, nr))];
      const nextCol = colIds[Math.max(0, Math.min(colIds.length - 1, nc))];
      if (e.shiftKey && nr !== r) {
        if (!anchor.current || !selSet.has(anchor.current)) anchor.current = row;
        const [a, b] = [rowIndex.get(anchor.current) ?? r, rowIndex.get(next)!].sort((x, y) => x - y);
        setSelected(navRows.slice(a, b + 1));
      }
      focusCell(next, nextCol);
    };

    let handled = true;
    switch (e.key) {
      case "ArrowDown":
        go(mod ? navRows.length - 1 : r + 1, c);
        break;
      case "ArrowUp":
        go(mod ? 0 : r - 1, c);
        break;
      case "ArrowRight":
        go(r, mod ? colIds.length - 1 : c + 1);
        break;
      case "ArrowLeft":
        go(r, mod ? 0 : c - 1);
        break;
      case "Home":
        go(mod ? 0 : r, 0);
        break;
      case "End":
        go(mod ? navRows.length - 1 : r, colIds.length - 1);
        break;
      case "PageDown":
        go(r + 10, c);
        break;
      case "PageUp":
        go(r - 10, c);
        break;
      case " ":
        onOpen(row);
        break;
      case "Enter":
      case "F2":
        if (col === "title") setEditing(row);
        else if (col === "subtasks" || col === "updated") onOpen(row);
        else handled = false;
        break;
      case "Escape":
        if (sel.length) setSelected([]);
        else handled = false;
        break;
      case "Backspace":
      case "Delete":
        if (mod) dispatch({ type: "delete", ids: selSet.has(row) ? sel : [row] });
        else clear(row, col);
        break;
      default:
        if (mod && e.key === "a") setSelected(navRows);
        else if (!mod && !e.altKey && e.key === "x") toggleRow(row, e.shiftKey);
        else if (!mod && !e.altKey && e.key === "c") {
          const g = groups.find((x) => x.rows.some((t) => t.id === row));
          if (g) setAdding(g.key);
        } else if (!mod && /^[a-z0-9]$/i.test(e.key)) {
          // Stops a closed select's typeahead from picking a value
          e.preventDefault();
          handled = false;
        } else handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const cellFromEvent = (e: React.ClipboardEvent) => {
    const td = (e.target as HTMLElement).closest<HTMLElement>("td[data-col]");
    if (!td || (e.target as HTMLElement).matches("input, textarea")) return null;
    return { row: td.dataset.row!, col: td.dataset.col as ColumnId };
  };

  const startResize = (e: React.PointerEvent<HTMLElement>, c: ColumnPref) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const startX = e.clientX;
    const min = columnMeta[c.id].min;
    let width = c.width;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      width = Math.round(Math.max(min, Math.min(720, c.width + ev.clientX - startX)));
      setResize({ id: c.id, width });
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setResize(null);
      setPrefs({ columns: prefs.columns.map((x) => (x.id === c.id ? { ...x, width } : x)) });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const setSort = (s: Prefs["sort"]) => setPrefs({ sort: s });

  const points = (list: Task[]) => list.reduce((sum, t) => sum + (t.size ? sizePoints[t.size] : 0), 0);
  const subtaskTotals = rows.reduce(
    (acc, t) => [acc[0] + t.subtasks.filter((s) => s.done).length, acc[1] + t.subtasks.length],
    [0, 0],
  );
  const overdue = rows.filter((t) => t.status !== "done" && dueState(t.due, today) === "overdue").length;
  const assignees = [...new Set(rows.map((t) => t.assignee).filter(Boolean))].map((id) => personById(id)!);
  const projectsUsed = new Set(rows.map((t) => t.project).filter(Boolean)).size;
  const urgent = rows.filter((t) => t.priority === "urgent").length;
  const byStatus = statuses.map((s) => ({ ...s, n: rows.filter((t) => t.status === s.id).length }));

  const stickyGutter = "sticky left-0";
  const stickyTitle = { left: GUTTER } as const;
  const seam = (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 -right-[5px] w-1 dither-50 transition-opacity [--dither:var(--ink)]",
        scrolledX ? "opacity-40" : "opacity-0",
      )}
    />
  );

  const cellClass = (selectedRow: boolean) =>
    cn(
      "h-9 border-r border-b border-line p-0 align-middle outline-none",
      "focus-within:shadow-[inset_0_0_0_2px_var(--lapis)] focus:shadow-[inset_0_0_0_2px_var(--lapis)]",
      "scroll-mt-[4.5rem] scroll-mb-9",
      selectedRow ? "bg-lapis-soft" : "bg-raised group-hover/row:bg-surface group-data-[state=open]/row:bg-surface",
    );

  const renderCell = (t: Task, col: ColumnId) => {
    const tab = tabFor(t.id, col);
    const label = `${columnMeta[col].label} of ${t.id}`;
    switch (col) {
      case "status":
      case "assignee":
      case "priority":
      case "size":
      case "project":
        return (
          <Select
            variant="cell"
            tabIndex={tab}
            aria-label={label}
            value={valueOf(t, col)[0]}
            onValueChange={(v) => setField([t.id], col, v)}
            options={fieldOptions[col]}
          />
        );
      case "due":
        return (
          <DatePicker
            variant="cell"
            due={t.status !== "done"}
            tabIndex={tab}
            aria-label={label}
            placeholder=""
            value={t.due}
            onChange={(d) => setDue([t.id], d)}
          />
        );
      case "start":
        return (
          <DatePicker
            variant="cell"
            tabIndex={tab}
            aria-label={label}
            placeholder=""
            value={t.start}
            onChange={(d) => setDate("start", [t.id], d)}
          />
        );
      case "labels":
        return (
          <MultiSelect
            variant="cell"
            tabIndex={tab}
            aria-label={label}
            placeholder=""
            searchPlaceholder="Find a label"
            value={t.labels}
            onValueChange={(next) => setLabels(t, next)}
            options={fieldOptions.label}
            renderValue={(chosen) =>
              chosen.map((o) => (
                <Badge key={o.value} tone={labelTone(o.value)}>
                  {o.label}
                </Badge>
              ))
            }
          />
        );
      case "subtasks":
        return (
          <span className="flex h-full items-center px-3 text-[11px] text-ink-3">
            <SubtaskCells subtasks={t.subtasks} />
          </span>
        );
      case "updated": {
        const last = t.activity.at(-1);
        return (
          <span className="flex h-full items-center px-3">
            {last && now ? (
              <Tooltip content={`${last.who} ${last.text}`}>
                <span className="font-mono text-[11px] text-ink-3">{timeAgo(last.at, now)}</span>
              </Tooltip>
            ) : null}
          </span>
        );
      }
      case "title":
        return null;
    }
  };

  const headerCell = (c: ColumnPref, i: number) => {
    const meta = columnMeta[c.id];
    const sortedHere = sort && (sort.key === c.id || (c.id === "title" && sort.key === "id")) ? sort : null;
    const sortOptions: [SortKey, string, string][] =
      c.id === "title"
        ? [
            ["title", "A to Z", "Z to A"],
            ["id", "Oldest first", "Newest first"],
          ]
        : c.id === "updated"
          ? [["updated", "Recent first", "Oldest first"]]
          : [[c.id, "Ascending", "Descending"]];
    return (
      <th
        key={c.id}
        scope="col"
        style={i === 0 ? stickyTitle : undefined}
        className={cn(
          "sticky top-0 h-9 border-r border-b border-line bg-surface p-0 text-left font-normal",
          i === 0 ? "z-30" : "z-20",
        )}
      >
        <div className="group/head relative flex h-full items-center">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex h-full min-w-0 flex-1 items-center gap-1.5 px-3 font-mono text-[11px] outline-none hover:text-ink focus-visible:shadow-[inset_0_0_0_2px_var(--lapis)] data-[state=open]:bg-sunken data-[state=open]:text-ink",
                sortedHere ? "text-ink" : "text-ink-3",
              )}
            >
              <span className="truncate">{meta.label}</span>
              {sortedHere ? (
                <Icon name={sortedHere.dir === 1 ? "arrow-up" : "arrow-down"} size="sm" className="text-lapis" label={sortedHere.dir === 1 ? "ascending" : "descending"} />
              ) : null}
              {grouping !== "none" && meta.group === grouping ? <Icon name="group" size="sm" className="text-ink-3" label="grouped" /> : null}
              <PixelCaret className="ml-auto opacity-0 group-hover/head:opacity-100 group-data-[state=open]/head:opacity-100" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel>Sort</DropdownMenuLabel>
              {sortOptions.flatMap(([key, asc, desc]) => [
                <DropdownMenuItem key={`${key}1`} onSelect={() => setSort({ key, dir: 1 })}>
                  <Icon name="arrow-up" /> {asc}
                  {sort?.key === key && sort.dir === 1 ? <Icon name="check" className="ml-auto !text-lapis" /> : null}
                </DropdownMenuItem>,
                <DropdownMenuItem key={`${key}-1`} onSelect={() => setSort({ key, dir: -1 })}>
                  <Icon name="arrow-down" /> {desc}
                  {sort?.key === key && sort.dir === -1 ? <Icon name="check" className="ml-auto !text-lapis" /> : null}
                </DropdownMenuItem>,
              ])}
              {sortedHere ? (
                <DropdownMenuItem onSelect={() => setSort(null)}>
                  <Icon name="x" /> Clear sort
                </DropdownMenuItem>
              ) : null}
              {meta.group ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setPrefs({ grouping: grouping === meta.group ? "none" : meta.group })}
                  >
                    <Icon name="group" /> {grouping === meta.group ? "Stop grouping" : `Group by ${meta.label.toLowerCase()}`}
                  </DropdownMenuItem>
                </>
              ) : null}
              {c.id !== "title" ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setPrefs({ columns: prefs.columns.map((x) => (x.id === c.id ? { ...x, hidden: true } : x)) })}
                  >
                    <Icon name="eye-off" /> Hide field
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <span
            aria-hidden
            onPointerDown={(e) => startResize(e, c)}
            onDoubleClick={() =>
              setPrefs({ columns: prefs.columns.map((x) => (x.id === c.id ? { ...x, width: columnMeta[c.id].width } : x)) })
            }
            className="col-resize group/resize absolute inset-y-0 right-0 z-10 flex w-2 justify-end"
          >
            <span
              className={cn(
                "-mr-px h-full w-0.5 transition-colors group-hover/resize:bg-lapis",
                resize?.id === c.id && "bg-lapis",
              )}
            />
          </span>
          {i === 0 ? seam : null}
        </div>
      </th>
    );
  };

  const span = cols.length + 2;

  return (
    <div className="relative flex h-full flex-col">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const x = e.currentTarget.scrollLeft > 0;
          if (x !== scrolledX) setScrolledX(x);
        }}
        onKeyDownCapture={onKeyDownCapture}
        onCopy={(e) => {
          const cell = cellFromEvent(e);
          if (!cell || window.getSelection()?.toString()) return;
          e.preventDefault();
          e.clipboardData.setData("text/plain", cellText(state.tasks[cell.row], cell.col));
          toast({ icon: "copy", title: "Copied", description: cellText(state.tasks[cell.row], cell.col) || "An empty cell", duration: 1800 });
        }}
        onPaste={(e) => {
          const cell = cellFromEvent(e);
          if (!cell) return;
          e.preventDefault();
          paste(cell.row, cell.col, e.clipboardData.getData("text/plain"));
        }}
        className="min-h-0 flex-1 overflow-auto overscroll-contain"
      >
        <table
          role="grid"
          aria-label="Tasks"
          aria-rowcount={navRows.length + 1}
          className="table-fixed border-separate border-spacing-0 text-sm"
          style={{ width: `max(100%, calc(${GUTTER + TRAIL + restWidth}px + ${titleCss}))` }}
        >
          <colgroup>
            <col style={{ width: GUTTER }} />
            {cols.map((c, i) => (
              <col key={c.id} style={{ width: i === 0 ? titleCss : widthOf(c) }} />
            ))}
            <col />
          </colgroup>

          <thead>
            <tr>
              <th scope="col" className={cn(stickyGutter, "top-0 z-30 h-9 border-b border-line bg-surface p-0")}>
                <span className="grid h-full place-items-center">
                  <Checkbox
                    aria-label={sel.length ? "Clear selection" : "Select all rows"}
                    checked={allChecked}
                    onCheckedChange={() => setSelected(sel.length ? [] : navRows)}
                  />
                </span>
              </th>
              {cols.map(headerCell)}
              <th scope="col" className="sticky top-0 z-20 h-9 border-b border-line bg-surface p-0">
                <FieldsMenu
                  prefs={prefs}
                  setPrefs={setPrefs}
                  trigger={
                    <button
                      aria-label="Show or hide fields"
                      className="grid h-9 w-11 place-items-center text-ink-3 outline-none hover:bg-sunken hover:text-ink focus-visible:shadow-[inset_0_0_0_2px_var(--lapis)] data-[state=open]:bg-sunken"
                    >
                      <Icon name="plus" size="sm" />
                    </button>
                  }
                />
              </th>
            </tr>
          </thead>

          <tbody>
            {groups.map((g) => {
              const collapsed = isCollapsed(g);
              const pts = points(g.rows);
              return (
                <Fragment key={g.key}>
                  {g.title ? (
                    <tr className="group/grp">
                      <td colSpan={span} className="sticky top-9 z-[15] h-9 border-b border-line bg-sunken p-0">
                        <div className="sticky left-0 flex h-9 w-max items-center gap-2.5 pr-3 pl-3.5">
                          <button
                            aria-expanded={!collapsed}
                            onClick={() =>
                              setPrefs({
                                collapsed: collapsed ? prefs.collapsed.filter((k) => k !== g.key) : [...prefs.collapsed, g.key],
                              })
                            }
                            className="flex h-7 items-center gap-2.5 pr-1.5 outline-none focus-visible:ring-2 focus-visible:ring-lapis"
                          >
                            <PixelCaret className={cn("text-ink-3 transition-transform", collapsed && "-rotate-90")} />
                            {g.icon}
                            <span className="text-sm font-medium">{g.title}</span>
                          </button>
                          <span className="font-mono text-[11px] text-ink-3">{g.rows.length}</span>
                          {pts ? <span className="font-mono text-[11px] text-ink-3">· {pts} pt</span> : null}
                          <Tooltip content={`Add to ${g.title}`}>
                            <button
                              aria-label={`Add a task to ${g.title}`}
                              onClick={() => {
                                if (collapsed) setPrefs({ collapsed: prefs.collapsed.filter((k) => k !== g.key) });
                                setAdding(g.key);
                              }}
                              className="grid size-6 place-items-center text-ink-3 opacity-0 group-hover/grp:opacity-100 hover:bg-raised hover:text-ink focus-visible:opacity-100 pointer-coarse:opacity-100"
                            >
                              <Icon name="plus" size="sm" />
                            </button>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  ) : null}

                  {collapsed
                    ? null
                    : g.rows.map((t) => {
                        const isSel = selSet.has(t.id);
                        const n = (rowIndex.get(t.id) ?? 0) + 1;
                        return (
                          <TaskMenu key={t.id} task={t} dispatch={dispatch} onOpen={onOpen}>
                            <tr className="group/row" aria-selected={isSel} aria-rowindex={n + 1}>
                              <td className={cn(cellClass(isSel), stickyGutter, "z-[5] border-r-0")}>
                                <span className="relative grid h-full place-items-center">
                                  <span
                                    className={cn(
                                      "font-mono text-[11px] text-ink-3 tabular-nums group-hover/row:invisible pointer-coarse:invisible",
                                      sel.length && "invisible",
                                    )}
                                  >
                                    {n}
                                  </span>
                                  <Checkbox
                                    tabIndex={-1}
                                    aria-label={`Select ${t.id}`}
                                    checked={isSel}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      toggleRow(t.id, e.shiftKey);
                                    }}
                                    className={cn(
                                      "absolute opacity-0 group-hover/row:opacity-100 pointer-coarse:opacity-100",
                                      sel.length && "opacity-100",
                                    )}
                                  />
                                </span>
                              </td>

                              {cols.map((c, i) => {
                                const title = c.id === "title";
                                return (
                                  <td
                                    key={c.id}
                                    data-row={t.id}
                                    data-col={c.id}
                                    tabIndex={c.id === "subtasks" || c.id === "updated" ? tabFor(t.id, c.id) : undefined}
                                    onFocus={() =>
                                      (active?.row !== t.id || active.col !== c.id) && setActive({ row: t.id, col: c.id })
                                    }
                                    style={title ? stickyTitle : { scrollMarginLeft: stickyWidth }}
                                    className={cn(cellClass(isSel), title && "sticky z-[5]")}
                                  >
                                    {title ? (
                                      <TitleCell
                                        task={t}
                                        tabIndex={tabFor(t.id, "title")}
                                        editing={editing === t.id}
                                        onEdit={() => setEditing(t.id)}
                                        onDone={(value, fromKeyboard) => {
                                          if (value !== null) rename(t, value);
                                          setEditing(null);
                                          if (fromKeyboard) requestAnimationFrame(() => focusCell(t.id, "title"));
                                        }}
                                        onOpen={() => onOpen(t.id)}
                                      />
                                    ) : (
                                      renderCell(t, c.id)
                                    )}
                                    {i === 0 ? seam : null}
                                  </td>
                                );
                              })}
                              <td className={cn(cellClass(isSel), "border-r-0")} />
                            </tr>
                          </TaskMenu>
                        );
                      })}

                  {collapsed ? null : (
                    <AddRow
                      span={span}
                      open={adding === g.key}
                      label={g.title ? `Add to ${g.title}` : "Add a task"}
                      onOpen={() => setAdding(g.key)}
                      onClose={() => setAdding(null)}
                      onAdd={(title) => dispatch({ type: "add", status: "todo", title, patch: g.patch })}
                      stickyTitle={stickyTitle}
                    />
                  )}
                </Fragment>
              );
            })}
          </tbody>

          {rows.length ? (
            <tfoot>
              <tr className="font-mono text-[11px] text-ink-3">
                <td className={cn(stickyGutter, "bottom-0 z-30 h-8 border-t border-line-strong bg-surface")} />
                {cols.map((c, i) => (
                  <td
                    key={c.id}
                    style={i === 0 ? stickyTitle : undefined}
                    className={cn(
                      "sticky bottom-0 h-8 border-t border-r border-line-strong border-r-line bg-surface px-3",
                      i === 0 ? "z-30" : "z-20",
                    )}
                  >
                    <FooterCell
                      col={c.id}
                      count={rows.length}
                      byStatus={byStatus}
                      points={points(rows)}
                      subtasks={subtaskTotals}
                      overdue={overdue}
                      assignees={assignees}
                      projects={projectsUsed}
                      urgent={urgent}
                    />
                    {i === 0 ? seam : null}
                  </td>
                ))}
                <td className="sticky bottom-0 z-20 h-8 border-t border-line-strong bg-surface" />
              </tr>
            </tfoot>
          ) : null}
        </table>

        {rows.length === 0 && filtered ? (
          <EmptyState
            art="crystal-shard"
            title="Nothing matches"
            body="No task fits the search and filters. Loosen them to see more of the board."
            action={
              <Button size="sm" onClick={onClearFilters}>
                <Icon name="x" size="sm" /> Clear search and filters
              </Button>
            }
            className="sticky left-0"
          />
        ) : null}
      </div>

      {sel.length ? (
        <BulkBar
          ids={sel}
          onClear={() => {
            setSelected([]);
            if (active) focusCell(active.row, active.col);
          }}
          setField={(field, value) => setField(sel, field, value)}
          setDue={(d) => setDue(sel, d)}
          onDelete={() => dispatch({ type: "delete", ids: sel })}
        />
      ) : null}
    </div>
  );
}

function TitleCell({
  task,
  tabIndex,
  editing,
  onEdit,
  onDone,
  onOpen,
}: {
  task: Task;
  tabIndex: number;
  editing: boolean;
  onEdit: () => void;
  onDone: (value: string | null, fromKeyboard: boolean) => void;
  onOpen: () => void;
}) {
  const done = task.status === "done";
  // Enter and blur can both end an edit; only the first counts
  const ended = useRef(false);
  const end = (value: string | null, fromKeyboard: boolean) => {
    if (ended.current) return;
    ended.current = true;
    onDone(value, fromKeyboard);
  };
  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={task.title}
        aria-label={`Rename ${task.id}`}
        onFocus={(e) => {
          ended.current = false;
          e.currentTarget.select();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") end(e.currentTarget.value, true);
          if (e.key === "Escape") {
            e.stopPropagation();
            end(null, true);
          }
        }}
        onBlur={(e) => end(e.currentTarget.value, false)}
        className="h-9 w-full bg-raised px-3 text-sm outline-none"
      />
    );
  }
  return (
    <div className="flex h-9 min-w-0 items-center gap-2.5 pr-1.5 pl-3">
      <span className="w-[3.25rem] shrink-0 font-mono text-[11px] text-ink-3">{task.id}</span>
      <button
        tabIndex={tabIndex}
        onClick={onOpen}
        onDoubleClick={(e) => {
          e.preventDefault();
          onEdit();
        }}
        className={cn(
          "min-w-0 truncate text-left outline-none decoration-lapis/40 underline-offset-2 hover:text-lapis hover:underline",
          done && "text-ink-2 line-through decoration-line-strong",
        )}
      >
        {task.title}
      </button>
      {task.comments ? (
        <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-ink-3">
          <Icon name="comment" size="sm" />
          {task.comments}
        </span>
      ) : null}
      <span className="ml-auto flex shrink-0 opacity-0 group-hover/row:opacity-100 pointer-coarse:hidden">
        <Tooltip content="Rename">
          <button
            tabIndex={-1}
            aria-label={`Rename ${task.id}`}
            onClick={onEdit}
            className="grid size-6 place-items-center text-ink-3 hover:bg-sunken hover:text-ink"
          >
            <Icon name="pencil" size="sm" />
          </button>
        </Tooltip>
        <Tooltip content="Open">
          <button
            tabIndex={-1}
            aria-label={`Open ${task.id}`}
            onClick={onOpen}
            className="grid size-6 place-items-center text-ink-3 hover:bg-sunken hover:text-ink"
          >
            <Icon name="panel" size="sm" />
          </button>
        </Tooltip>
      </span>
    </div>
  );
}

function AddRow({
  span,
  open,
  label,
  onOpen,
  onClose,
  onAdd,
  stickyTitle,
}: {
  span: number;
  open: boolean;
  label: string;
  onOpen: () => void;
  onClose: () => void;
  onAdd: (title: string) => void;
  stickyTitle: React.CSSProperties;
}) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    if (draft.trim()) onAdd(draft.trim());
    setDraft("");
  };
  return (
    <tr className="group/add">
      <td className="sticky left-0 z-[5] h-9 border-b border-line bg-raised p-0">
        <span className="grid h-full place-items-center text-ink-3">
          <Icon name="plus" size="sm" />
        </span>
      </td>
      <td style={stickyTitle} className="sticky z-[5] h-9 border-b border-line bg-raised p-0">
        {open ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") {
                e.stopPropagation();
                setDraft("");
                onClose();
              }
            }}
            onBlur={() => {
              submit();
              onClose();
            }}
            placeholder="Task title, then Enter. Esc to stop"
            aria-label={label}
            className="h-9 w-full bg-raised px-3 text-sm shadow-[inset_0_0_0_2px_var(--lapis)] outline-none placeholder:text-ink-3"
          />
        ) : (
          <button
            tabIndex={-1}
            onClick={onOpen}
            className="flex h-9 w-full items-center px-3 text-left text-sm text-ink-3 hover:bg-surface hover:text-ink"
          >
            {label}
          </button>
        )}
      </td>
      <td colSpan={span - 2} className="h-9 border-b border-line bg-raised" />
    </tr>
  );
}

function FooterCell({
  col,
  count,
  byStatus,
  points,
  subtasks,
  overdue,
  assignees,
  projects,
  urgent,
}: {
  col: ColumnId;
  count: number;
  byStatus: { id: StatusCategory; title: string; n: number }[];
  points: number;
  subtasks: number[];
  overdue: number;
  assignees: Person[];
  projects: number;
  urgent: number;
}) {
  switch (col) {
    case "title":
      return (
        <span>
          {count} {count === 1 ? "task" : "tasks"}
        </span>
      );
    case "status":
      return (
        <Tooltip content={byStatus.filter((s) => s.n).map((s) => `${s.n} ${s.title.toLowerCase()}`).join(" · ")}>
          <span className="flex h-2 w-full gap-px" role="img" aria-label="Tasks by status">
            {byStatus
              .filter((s) => s.n)
              .map((s) => (
                <span key={s.id} className="relative h-full border border-line-strong" style={{ flex: s.n }}>
                  <DitherFill level={s.id === "done" ? 75 : 50} tone={statusTone[s.id]} className="absolute inset-0" />
                </span>
              ))}
          </span>
        </Tooltip>
      );
    case "assignee":
      return assignees.length ? (
        <AvatarStack>
          {assignees.map((p) => (
            <Avatar key={p.id} name={p.name} src={p.avatar} tone={p.tone} size="xs" />
          ))}
        </AvatarStack>
      ) : null;
    case "priority":
      return urgent ? <span className="text-hematite">{urgent} urgent</span> : null;
    case "size":
      return points ? <span>{points} pt</span> : null;
    case "project":
      return projects ? (
        <span>
          {projects} {projects === 1 ? "project" : "projects"}
        </span>
      ) : null;
    case "due":
      return overdue ? <span className="text-hematite">{overdue} overdue</span> : null;
    case "subtasks":
      return subtasks[1] ? (
        <span>
          {subtasks[0]}/{subtasks[1]} done
        </span>
      ) : null;
    default:
      return null;
  }
}

function BulkBar({
  ids,
  onClear,
  setField,
  setDue,
  onDelete,
}: {
  ids: string[];
  onClear: () => void;
  setField: (field: GroupField, value: string) => void;
  setDue: (due: string | undefined) => void;
  onDelete: () => void;
}) {
  const [dueOpen, setDueOpen] = useState(false);
  const fields: GroupField[] = ["status", "assignee", "priority", "size", "project"];
  const button =
    "flex h-8 shrink-0 items-center gap-1.5 px-2 text-xs text-ink-2 outline-none hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-lapis data-[state=open]:bg-sunken data-[state=open]:text-ink";
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-11 z-40 flex justify-center px-3">
      <div className="toast-in pointer-events-auto relative isolate max-w-full">
        <DitherFill level={50} tone="ink" className="absolute inset-0 -z-10 translate-x-1 translate-y-1 opacity-60" />
        <div
          role="toolbar"
          aria-label="Edit selected tasks"
          onKeyDown={(e) => {
            if (e.key === "Escape" && e.currentTarget.contains(e.target as Node)) onClear();
          }}
          className="flex items-center overflow-x-auto border border-ink bg-raised p-1"
        >
          <span className="flex shrink-0 items-center gap-2 px-2 text-xs">
            <span className="grid h-5 min-w-5 place-items-center bg-lapis px-1 font-mono text-[11px] text-on-accent">{ids.length}</span>
            selected
          </span>
          <span className="mx-1 h-5 w-px shrink-0 bg-line" />
          {fields.map((f) => (
            <DropdownMenu key={f}>
              <DropdownMenuTrigger className={button}>
                {fieldLabel[f]}
                <PixelCaret />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-48">
                <DropdownMenuLabel>
                  Set {fieldLabel[f].toLowerCase()} for {ids.length}
                </DropdownMenuLabel>
                {fieldOptions[f].map((o) => (
                  <DropdownMenuItem key={o.value} onSelect={() => setField(f, o.value)}>
                    {o.icon}
                    <span className={cn(o.muted && "text-ink-3")}>{o.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
          <Popover open={dueOpen} onOpenChange={setDueOpen}>
            <PopoverTrigger className={button}>
              Due
              <PixelCaret />
            </PopoverTrigger>
            <PopoverContent side="top" onOpenAutoFocus={(e) => e.preventDefault()}>
              <Calendar
                autoFocus
                onSelect={(d) => {
                  setDue(d);
                  setDueOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
          <span className="mx-1 h-5 w-px shrink-0 bg-line" />
          <button onClick={onDelete} className={cn(button, "hover:bg-hematite-soft hover:text-hematite")}>
            <Icon name="trash" size="sm" /> Delete
          </button>
          <Tooltip content="Clear selection · Esc">
            <button aria-label="Clear selection" onClick={onClear} className={cn(button, "w-8 justify-center")}>
              <Icon name="x" size="sm" />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
