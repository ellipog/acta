"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { customValue, formatDue, withCustom, type CustomField, type CustomValue, type Task } from "@/lib/board-store";

// Editing one of the board's own fields on a task. Text and numbers save when you leave the box, so typing doesn't
// leave a line in the activity for every key. In a table cell, dates and choices edit in place, while text and
// numbers show there and open the task

const NONE = "__none";

export function CustomFieldInput({
  task,
  field,
  cell,
  onChange,
}: {
  task: Task;
  field: CustomField;
  cell?: { tabIndex: number; label: string };
  onChange: (custom: Record<string, CustomValue>, note: string) => void;
}) {
  const look = cell
    ? { variant: "cell" as const, tabIndex: cell.tabIndex, "aria-label": cell.label, placeholder: "" }
    : { "aria-label": field.name, placeholder: "None" };
  const value = customValue(task, field);
  const set = (next: CustomValue | undefined, shown?: string) =>
    onChange(
      withCustom(task, field.id, next),
      next === undefined || (Array.isArray(next) && !next.length)
        ? `cleared ${field.name}`
        : `set ${field.name} to ${shown ?? (Array.isArray(next) ? next.join(", ") : next)}`,
    );

  switch (field.type) {
    case "date":
      return (
        <DatePicker
          {...look}
          value={typeof value === "string" ? value : undefined}
          onChange={(d) => set(d, d ? formatDue(d) : undefined)}
          className={cell ? undefined : "px-2"}
        />
      );
    case "select":
      return (
        <Select
          {...look}
          value={typeof value === "string" ? value : NONE}
          onValueChange={(v) => set(v === NONE ? undefined : v)}
          options={[
            ...(field.options ?? []).map((o) => ({ value: o, label: o })),
            { value: NONE, label: "None", muted: true },
          ]}
        />
      );
    case "multi":
      return (
        <MultiSelect
          {...look}
          searchPlaceholder={`Find a ${field.name.toLowerCase()}`}
          value={Array.isArray(value) ? value : []}
          onValueChange={(next) => set(next)}
          options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
          renderValue={(chosen) =>
            chosen.map((o) => (
              <Badge key={o.value} tone="lapis">
                {o.label}
              </Badge>
            ))
          }
        />
      );
    default:
      return <TextField key={`${task.id}-${field.id}-${String(value ?? "")}`} field={field} value={value} set={set} />;
  }
}

function TextField({
  field,
  value,
  set,
}: {
  field: CustomField;
  value: CustomValue | undefined;
  set: (next: CustomValue | undefined) => void;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const commit = () => {
    const clean = draft.trim();
    if (field.type === "number") {
      const n = clean === "" ? undefined : Number(clean);
      if (n !== undefined && !Number.isFinite(n)) return setDraft(value === undefined ? "" : String(value));
      if (n !== value) set(n);
    } else if (clean !== (value ?? "")) set(clean.slice(0, 1000) || undefined);
  };
  return (
    <Input
      aria-label={field.name}
      value={draft}
      inputMode={field.type === "number" ? "decimal" : undefined}
      placeholder="None"
      maxLength={1000}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
