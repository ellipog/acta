"use client";

import { useId } from "react";
import { DndContext, MouseSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

// Dragging the sidebar's boards into order, apart from the rest of the sidebar so it can arrive later

export function SortableBoards({
  ids,
  onStart,
  onEnd,
  onCancel,
  children,
}: {
  ids: string[];
  onStart: () => void;
  onEnd: (from: string, to: string | null) => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const dndId = useId();
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }));
  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onStart}
      onDragEnd={({ active, over }: DragEndEvent) => onEnd(String(active.id), over ? String(over.id) : null)}
      onDragCancel={onCancel}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

// Dragged by the mouse. Touch and keyboard move a board from its menu, so a long press still opens that menu
export function SortableBoard({
  id,
  dragging,
  children,
  ...rest
}: {
  id: string;
  dragging: React.RefObject<boolean>;
  children: React.ReactNode;
} & React.ComponentProps<"div">) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      {...rest}
      ref={setNodeRef}
      {...listeners}
      onClickCapture={(e) => {
        if (!dragging.current) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{ transform: CSS.Translate.toString(transform && { ...transform, x: 0 }), transition }}
      className={cn("relative", isDragging && "z-10 bg-surface outline outline-ink")}
    >
      {children}
    </div>
  );
}
