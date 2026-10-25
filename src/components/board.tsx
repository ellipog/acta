import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/display";
import { DitherFill } from "@/components/ui/dither";
import { labelTone, personById, projectTone, type Priority, type Size, type StatusCategory, type Task } from "@/lib/board-store";
import { Tooltip } from "@/components/ui/overlays";
import { DueLabel } from "@/components/ui/date-picker";

export type { Priority, Size, StatusCategory, Task };

export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const filled = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 }[priority];
  return (
    <span
      role="img"
      aria-label={`${priority} priority`}
      className={cn("inline-flex h-3 w-3 shrink-0 flex-col-reverse justify-between", className)}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "h-[2px] w-full",
            i < filled ? (priority === "urgent" ? "bg-hematite" : "bg-ink-2") : "bg-line-strong",
          )}
        />
      ))}
    </span>
  );
}

export function StatusMarker({ status, className }: { status: StatusCategory; className?: string }) {
  const base = "relative inline-block size-3 shrink-0 border";
  switch (status) {
    case "backlog":
      return <span aria-label="Backlog" className={cn(base, "border-dashed border-ink-3", className)} />;
    case "todo":
      return <span aria-label="Todo" className={cn(base, "border-ink-2", className)} />;
    case "in_progress":
      return (
        <span aria-label="In progress" className={cn(base, "border-pyrite", className)}>
          <DitherFill level={50} tone="pyrite" className="absolute inset-px" />
        </span>
      );
    case "review":
      return (
        <span aria-label="In review" className={cn(base, "border-lapis", className)}>
          <DitherFill level={75} tone="lapis" className="absolute inset-px" />
        </span>
      );
    case "done":
      return <span aria-label="Done" className={cn(base, "border-malachite bg-malachite", className)} />;
  }
}

const sizePx = { xs: 4, s: 6, m: 8, l: 10, xl: 12 };

export function SizeIcon({ size, className }: { size?: Size; className?: string }) {
  return (
    <span role="img" aria-label={size ? `Size ${size.toUpperCase()}` : "No size"} className={cn("grid size-3 shrink-0 place-items-end", className)}>
      {size ? (
        <span className="bg-ink-2" style={{ width: sizePx[size], height: sizePx[size] }} />
      ) : (
        <span className="size-3 border border-dashed border-line-strong" />
      )}
    </span>
  );
}

const projectBorder = { lapis: "border-lapis", pyrite: "border-pyrite", malachite: "border-malachite", hematite: "border-hematite", ink: "border-ink-2" };

export function ProjectMark({ project, className }: { project?: string; className?: string }) {
  const tone = project ? projectTone[project] : undefined;
  if (!tone) return <span aria-hidden className={cn("size-3 shrink-0 border border-dashed border-line-strong", className)} />;
  return (
    <span aria-hidden className={cn("relative size-3 shrink-0 border", projectBorder[tone], className)}>
      <DitherFill level={50} tone={tone} className="absolute inset-px" />
    </span>
  );
}

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
  const done = task.status === "done";
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
      <div className="mt-3 flex min-h-6 items-center gap-2.5 text-[11px] whitespace-nowrap text-ink-3">
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
        {person ? (
          <Tooltip content={person.name}>
            <span className="ml-auto">
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
