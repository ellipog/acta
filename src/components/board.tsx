import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/display";
import { DitherFill } from "@/components/ui/dither";
import { closed, labelTone, personById, type Priority, type Size, type StatusCategory, type Task } from "@/lib/board-store";
import { Tooltip } from "@/components/ui/tooltip";
import { DueLabel } from "@/components/ui/date-picker";
import { PriorityIcon, StatusMarker } from "@/components/markers";

export type { Priority, Size, StatusCategory, Task };
// The small markers live on their own so the landing page can use them without the rest of the board
export { PriorityIcon, ProjectMark, SizeIcon, StatusMarker } from "@/components/markers";

export function SubtaskCells({ subtasks }: { subtasks: Task["subtasks"] }) {
  if (!subtasks.length) return null;
  const done = subtasks.filter((s) => s.done).length;
  return (
    <Tooltip content={`${done} of ${subtasks.length} subtasks done`}>
      <span className="flex items-center gap-1.5">
        <span className="flex gap-px">
          {subtasks.slice(0, 8).map((s) => (
            <span key={s.id} className={cn("h-2 w-1.5", s.done ? "bg-lapis" : "bg-line-strong")} />
          ))}
        </span>
        <span className="font-mono">
          {done}/{subtasks.length}
        </span>
      </span>
    </Tooltip>
  );
}

export function TaskCard({
  task,
  dragging,
  className,
  ...props
}: { task: Task; dragging?: boolean } & React.ComponentProps<"article">) {
  const person = personById(task.assignee);
  const done = closed(task.status);
  const card = (
    <article
      className={cn(
        "group relative border border-line bg-raised p-3 text-left transition-colors hover:border-line-strong",
        done && "bg-surface",
        className,
      )}
      {...props}
    >
      {task.priority === "urgent" && !done ? (
        <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-hematite" />
      ) : null}
      <div className="flex items-center gap-2 font-mono text-[11px] text-ink-3">
        <StatusMarker status={task.status} className="size-2.5" />
        <span>{task.id}</span>
        {task.project ? <span className="truncate">· {task.project}</span> : null}
      </div>
      <p className={cn("mt-1.5 text-sm leading-snug", done && "text-ink-2 line-through decoration-line-strong")}>
        {task.title}
      </p>
      {task.labels.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.map((l) => (
            <Badge key={l} tone={labelTone(l)}>
              {l}
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex min-h-6 items-center gap-2.5 text-[11px] text-ink-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5 whitespace-nowrap">
          <PriorityIcon priority={task.priority} />
          <SubtaskCells subtasks={task.subtasks} />
          {task.due ? <DueLabel due={task.due} done={done} /> : null}
          {task.comments ? (
            <span className="flex items-center gap-1 font-mono">
              <Icon name="comment" size="sm" />
              {task.comments}
            </span>
          ) : null}
          {task.size ? <span className="font-mono uppercase">{task.size}</span> : null}
        </div>
        {person ? (
          <Tooltip content={person.name}>
            <span className="shrink-0">
              <Avatar name={person.name} src={person.avatar} tone={person.tone} size="sm" />
            </span>
          </Tooltip>
        ) : null}
      </div>
    </article>
  );

  if (!dragging) return card;
  return (
    <div className="relative isolate -rotate-2">
      <DitherFill level={50} className="absolute inset-0 -z-10 translate-x-2 translate-y-2" />
      {card}
    </div>
  );
}

export function DropSlot({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn("relative h-16 border border-dashed border-lapis/60", className)} style={style}>
      <DitherFill level={12} tone="lapis" className="absolute inset-0" />
    </div>
  );
}
