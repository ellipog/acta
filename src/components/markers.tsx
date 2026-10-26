import { cn } from "@/lib/utils";
import { DitherFill } from "@/components/ui/dither";
import { projectTone, type Priority, type Size, type StatusCategory } from "@/lib/board-store";

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
