"use client";

import { useId } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { defaultColumns, metaOf, withFieldColumns, type ColumnPref, type Prefs } from "./fields";

export function FieldsMenu({
  prefs,
  setPrefs,
  trigger,
  align = "end",
}: {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  trigger: React.ReactElement;
  align?: "start" | "end";
}) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const columns = withFieldColumns(prefs.columns);
  const title = columns.find((c) => c.id === "title")!;
  const rest = columns.filter((c) => c.id !== "title");
  const shown = columns.filter((c) => !c.hidden).length;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = rest.map((c) => c.id as string);
    setPrefs({ columns: [title, ...arrayMove(rest, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))] });
  };

  const toggle = (id: string) =>
    setPrefs({ columns: columns.map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c)) });

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-64">
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <span className="text-sm font-medium">Fields</span>
          <span className="font-mono text-[11px] text-ink-3">
            {shown} of {columns.length} shown
          </span>
        </div>
        <div className="p-1">
          <div className="flex h-8 items-center gap-2 px-1 text-sm text-ink-3">
            <span className="grid w-5 place-items-center">
              <Icon name="lock" size="sm" />
            </span>
            <Checkbox checked disabled aria-label="Title is always shown" />
            <Icon name="file" size="sm" />
            Title
            <span className="ml-auto pr-1 text-[11px]">Frozen</span>
          </div>
          <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rest.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {rest.map((c) => (
                <FieldRow key={c.id} col={c} onToggle={() => toggle(c.id)} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[11px] text-ink-3">
          <span>Drag to reorder</span>
          <button onClick={() => setPrefs({ columns: withFieldColumns(defaultColumns) })} className="hover:text-ink">
            Reset
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FieldRow({ col, onToggle }: { col: ColumnPref; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const meta = metaOf(col.id);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative flex h-8 items-center gap-2 bg-raised px-1 hover:bg-sunken", isDragging && "z-10 outline outline-ink")}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={`Move ${meta.label}`}
        className="grid h-7 w-5 cursor-grab place-items-center text-ink-3 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-lapis active:cursor-grabbing"
      >
        <Icon name="grip" size="sm" />
      </button>
      <label className="flex h-full flex-1 cursor-pointer items-center gap-2 text-sm">
        <Checkbox checked={!col.hidden} onCheckedChange={onToggle} />
        <Icon name={meta.icon} size="sm" className="text-ink-3" />
        <span className={cn(col.hidden && "text-ink-3")}>{meta.label}</span>
      </label>
    </div>
  );
}
