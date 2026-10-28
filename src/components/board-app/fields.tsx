import { PriorityIcon, ProjectMark, SizeIcon, StatusMarker } from "@/components/board";
import { Avatar } from "@/components/ui/display";
import type { IconName } from "@/components/ui/icons";
import type { SelectOption } from "@/components/ui/select";
import {
  closed,
  customFields,
  customText,
  customValue,
  labels,
  labelTone,
  people,
  personById,
  priorities,
  priorityRank,
  projects,
  sizePoints,
  sizes,
  statuses,
  updatedAt,
  updatedBy,
  type CustomField,
  type FieldType,
  type Task,
} from "@/lib/board-store";
import { cn } from "@/lib/utils";

type BuiltinColumn =
  | "title"
  | "status"
  | "assignee"
  | "priority"
  | "size"
  | "project"
  | "start"
  | "due"
  | "labels"
  | "subtasks"
  | "updated"
  | "updatedBy";
// A board's own fields show as columns too, as "f:" and the field's id
export type ColumnId = BuiltinColumn | `f:${string}`;
export type GroupField = "status" | "priority" | "assignee" | "project" | "size";
export type Grouping = GroupField | "none";
export type SortKey = ColumnId | "id";
export type FilterField = "status" | "priority" | "assignee" | "label" | "project";
export type Filters = Partial<Record<FilterField, string[]>> & {
  // Leaves out done and canceled tasks
  hideDone?: boolean;
  // Shows archived tasks, which are otherwise left out
  archived?: boolean;
};
export const filterFields: FilterField[] = ["status", "assignee", "priority", "label", "project"];
export type View = "table" | "board" | "roadmap" | "public";
export type Zoom = "month" | "quarter" | "year";

export type ColumnPref = { id: ColumnId; width: number; hidden?: boolean };

export type Prefs = {
  view: View;
  grouping: Grouping;
  sort: { key: SortKey; dir: 1 | -1 } | null;
  columns: ColumnPref[];
  zoom: Zoom;
  collapsed: string[];
  filters: Filters;
  // Filters saved for this board, which it opens with
  keptFilters: Filters;
};

type ColumnMeta = { label: string; icon: IconName; width: number; min: number; group?: GroupField };

export const columnMeta: Record<BuiltinColumn, ColumnMeta> = {
  title: { label: "Title", icon: "file", width: 400, min: 220 },
  status: { label: "Status", icon: "status", width: 148, min: 112, group: "status" },
  assignee: { label: "Assignee", icon: "user", width: 164, min: 112, group: "assignee" },
  priority: { label: "Priority", icon: "flag", width: 136, min: 104, group: "priority" },
  size: { label: "Size", icon: "size", width: 92, min: 80, group: "size" },
  project: { label: "Project", icon: "folder", width: 128, min: 100, group: "project" },
  start: { label: "Start", icon: "calendar", width: 112, min: 96 },
  due: { label: "Due", icon: "flag", width: 120, min: 104 },
  labels: { label: "Labels", icon: "tag", width: 172, min: 104 },
  subtasks: { label: "Subtasks", icon: "list", width: 120, min: 100 },
  updated: { label: "Updated", icon: "clock", width: 108, min: 92 },
  updatedBy: { label: "Updated by", icon: "user", width: 164, min: 112 },
};

export const defaultColumns: ColumnPref[] = (
  [
    "title",
    "status",
    "assignee",
    "priority",
    "size",
    "project",
    "start",
    "due",
    "labels",
    "subtasks",
    "updated",
    "updatedBy",
  ] as BuiltinColumn[]
).map((id) => ({ id, width: columnMeta[id].width, hidden: id === "updated" || id === "updatedBy" }));

const typeIcon: Record<FieldType, IconName> = {
  text: "file",
  number: "size",
  date: "calendar",
  select: "status",
  multi: "tag",
};

/** The board's own field a column shows, if it shows one */
export const fieldOf = (id: ColumnId): CustomField | undefined =>
  id.startsWith("f:") ? customFields.find((f) => `f:${f.id}` === id) : undefined;

export function metaOf(id: ColumnId): ColumnMeta {
  if (!id.startsWith("f:")) return columnMeta[id as BuiltinColumn];
  const f = fieldOf(id);
  return { label: f?.name || "Field", icon: f ? typeIcon[f.type] : "file", width: 148, min: 96 };
}

/** Someone's columns with the board's own fields among them: new ones hidden at the end, removed ones gone */
export function withFieldColumns(columns: ColumnPref[]): ColumnPref[] {
  const kept = columns.filter((c) => !c.id.startsWith("f:") || fieldOf(c.id));
  const added = customFields
    .filter((f) => !kept.some((c) => c.id === `f:${f.id}`))
    .map((f) => ({ id: `f:${f.id}` as ColumnId, width: 148, hidden: true }));
  return added.length || kept.length !== columns.length ? [...kept, ...added] : columns;
}

export const defaultPrefs: Prefs = {
  view: "table",
  grouping: "status",
  sort: null,
  columns: defaultColumns,
  zoom: "month",
  collapsed: [],
  filters: {},
  keptFilters: {},
};

const Unassigned = () => <span className="size-5 shrink-0 border border-dashed border-line-strong" />;

export function LabelDot({ id, className }: { id: string; className?: string }) {
  const tone = labelTone(id);
  return (
    <span
      className={cn(
        "size-2.5 shrink-0",
        { lapis: "bg-lapis", pyrite: "bg-pyrite", malachite: "bg-malachite", hematite: "bg-hematite" }[tone],
        className,
      )}
    />
  );
}

export const fieldOptions: Record<GroupField | "label", SelectOption[]> = {
  // Read each time, since a board can name its statuses
  get status() {
    return statuses.map((s) => ({ value: s.id, label: s.title, icon: <StatusMarker status={s.id} /> }));
  },
  priority: priorities.map((p) => ({
    value: p.id,
    label: p.title,
    icon: <PriorityIcon priority={p.id} />,
    muted: p.id === "none",
  })),
  get assignee() {
    return [
      ...people.map((p) => ({
        value: p.id,
        label: p.name,
        icon: <Avatar name={p.name} src={p.avatar} tone={p.tone} size="xs" />,
      })),
      { value: "none", label: "Unassigned", icon: <Unassigned />, muted: true },
    ];
  },
  get project() {
    return [
      ...projects.map((p) => ({ value: p, label: p, icon: <ProjectMark project={p} /> })),
      { value: "none", label: "No project", icon: <ProjectMark />, muted: true },
    ];
  },
  size: [
    ...sizes.map((z) => ({
      value: z.id,
      label: z.title,
      icon: <SizeIcon size={z.id} />,
      hint: `${sizePoints[z.id]} pt`,
    })),
    { value: "none", label: "No size", icon: <SizeIcon />, muted: true },
  ],
  get label() {
    return labels.map((l) => ({ value: l.id, label: l.id, icon: <LabelDot id={l.id} /> }));
  },
};

export const fieldLabel: Record<GroupField | "label", string> = {
  status: "Status",
  priority: "Priority",
  assignee: "Assignee",
  project: "Project",
  size: "Size",
  label: "Label",
};

export const fieldIcon: Record<GroupField | "label", IconName> = {
  status: "status",
  priority: "flag",
  assignee: "user",
  project: "folder",
  size: "size",
  label: "tag",
};

export function valueOf(t: Task, field: GroupField | "label"): string[] {
  switch (field) {
    case "status":
      return [t.status];
    case "priority":
      return [t.priority];
    case "assignee":
      return [t.assignee ?? "none"];
    case "project":
      return [t.project ?? "none"];
    case "size":
      return [t.size ?? "none"];
    case "label":
      return t.labels;
  }
}

export function patchFor(field: GroupField, value: string): Partial<Task> {
  const v = value === "none" ? undefined : value;
  switch (field) {
    case "status":
      return { status: value as Task["status"] };
    case "priority":
      return { priority: value as Task["priority"] };
    case "assignee":
      return { assignee: v };
    case "project":
      return { project: v };
    case "size":
      return { size: v as Task["size"] };
  }
}

export function noteFor(field: GroupField, value: string): string {
  const option = fieldOptions[field].find((o) => o.value === value);
  const none = value === "none";
  switch (field) {
    case "status":
      return `moved it to ${option?.label}`;
    case "priority":
      return `set priority to ${option?.label}`;
    case "assignee":
      return none ? "removed the assignee" : `assigned ${personById(value)?.name}`;
    case "project":
      return none ? "removed the project" : `moved it to project ${value}`;
    case "size":
      return none ? "removed the size" : `sized it ${value.toUpperCase()}`;
  }
}

const statusOrder = Object.fromEntries(statuses.map((s, i) => [s.id, i]));
const sizeRank = (t: Task) => (t.size ? sizes.findIndex((z) => z.id === t.size) : sizes.length);
const num = (id: string) => Number(id.split("-")[1]);
const progress = (t: Task) => (t.subtasks.length ? t.subtasks.filter((s) => s.done).length / t.subtasks.length : -1);

export const compare: Record<BuiltinColumn | "id", (a: Task, b: Task) => number> = {
  id: (a, b) => num(a.id) - num(b.id),
  title: (a, b) => a.title.localeCompare(b.title),
  status: (a, b) => statusOrder[a.status] - statusOrder[b.status],
  priority: (a, b) => priorityRank[a.priority] - priorityRank[b.priority],
  size: (a, b) => sizeRank(a) - sizeRank(b),
  project: (a, b) => (a.project ?? "~").localeCompare(b.project ?? "~"),
  start: (a, b) => (a.start ?? "9999").localeCompare(b.start ?? "9999"),
  due: (a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"),
  assignee: (a, b) => (personById(a.assignee)?.name ?? "~").localeCompare(personById(b.assignee)?.name ?? "~"),
  labels: (a, b) => (a.labels[0] ?? "~").localeCompare(b.labels[0] ?? "~"),
  subtasks: (a, b) => progress(a) - progress(b),
  updated: (a, b) => updatedAt(b) - updatedAt(a),
  updatedBy: (a, b) => (updatedBy(a)?.who ?? "~").localeCompare(updatedBy(b)?.who ?? "~"),
};

// Empty values go last, the same as the board's own fields
function compareField(f: CustomField) {
  return (a: Task, b: Task) => {
    const x = customValue(a, f);
    const y = customValue(b, f);
    if (x === undefined || y === undefined) return (x === undefined ? 1 : 0) - (y === undefined ? 1 : 0);
    if (typeof x === "number" && typeof y === "number") return x - y;
    if (f.type === "select" && f.options) return f.options.indexOf(String(x)) - f.options.indexOf(String(y));
    return customText(a, f).localeCompare(customText(b, f));
  };
}

export function compareBy(key: SortKey): (a: Task, b: Task) => number {
  if (!key.startsWith("f:")) return compare[key as BuiltinColumn | "id"];
  const f = fieldOf(key as ColumnId);
  return f ? compareField(f) : () => 0;
}

export function matches(t: Task, filters: Filters) {
  if (t.archived && !filters.archived) return false;
  if (filters.hideDone && closed(t.status)) return false;
  return filterFields.every((field) => {
    const values = filters[field];
    return !values?.length || valueOf(t, field).some((v) => values.includes(v));
  });
}

/** Filters without the empty parts, in a set order, so two can be compared */
export function tidyFilters(filters: Filters): Filters {
  const out: Filters = {};
  if (filters.hideDone) out.hideDone = true;
  if (filters.archived) out.archived = true;
  for (const f of filterFields) if (filters[f]?.length) out[f] = [...filters[f]!].sort();
  return out;
}

export const sameFilters = (a: Filters, b: Filters) =>
  JSON.stringify(tidyFilters(a)) === JSON.stringify(tidyFilters(b));

export const hasFilters = (f: Filters) => Object.keys(tidyFilters(f)).length > 0;
