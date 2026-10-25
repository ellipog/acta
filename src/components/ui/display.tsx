import { cn } from "@/lib/utils";
import type { DitherName } from "@/lib/dither-assets";
import { Dither, DitherFill } from "./dither";

export function Panel({
  className,
  shadow,
  ...props
}: React.ComponentProps<"div"> & { shadow?: boolean }) {
  const panel = <div className={cn("border border-line bg-surface", className)} {...props} />;
  if (!shadow) return panel;
  return (
    <div className="relative isolate">
      <DitherFill level={50} tone="line" className="absolute inset-0 -z-10 translate-x-1.5 translate-y-1.5" />
      {panel}
    </div>
  );
}

const avatarSizes = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-11 text-sm" };

export function Avatar({
  name,
  sigil,
  tone = "lapis",
  size = "md",
  className,
}: {
  name: string;
  sigil?: DitherName;
  tone?: "lapis" | "pyrite" | "malachite" | "hematite";
  size?: keyof typeof avatarSizes;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const toneClass = {
    lapis: "bg-lapis-soft text-lapis-ink border-lapis/30",
    pyrite: "bg-pyrite-soft text-pyrite-ink border-pyrite/40",
    malachite: "bg-malachite-soft text-malachite-ink border-malachite/30",
    hematite: "bg-hematite-soft text-hematite-ink border-hematite/30",
  }[tone];
  return (
    <span
      role={sigil ? undefined : "img"}
      aria-label={sigil ? undefined : name}
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden border font-mono font-medium",
        avatarSizes[size],
        toneClass,
        className,
      )}
    >
      {sigil ? (
        <Dither name={sigil} tone={tone} fill smooth className="inset-0.5" label={name} />
      ) : (
        initials
      )}
    </span>
  );
}

export function AvatarStack({ children }: { children: React.ReactNode }) {
  return <div className="flex -space-x-1.5 [&>*]:ring-2 [&>*]:ring-surface">{children}</div>;
}

export function Progress({
  value,
  tone = "lapis",
  className,
}: {
  value: number;
  tone?: "lapis" | "pyrite" | "malachite";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const bg = { lapis: "bg-lapis", pyrite: "bg-pyrite", malachite: "bg-malachite" }[tone];
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative h-2 w-full overflow-hidden border border-line bg-sunken", className)}
    >
      <div className={cn("absolute inset-y-0 left-0", bg)} style={{ width: `${pct}%` }} />
      {pct > 0 && pct < 100 ? (
        <>
          <DitherFill level={50} tone={tone} className="absolute inset-y-0 w-2" style={{ left: `${pct}%` }} />
          <DitherFill level={12} tone={tone} className="absolute inset-y-0 w-2" style={{ left: `calc(${pct}% + 8px)` }} />
        </>
      ) : null}
    </div>
  );
}

export function EmptyState({
  art,
  title,
  body,
  action,
  className,
}: {
  art: DitherName;
  title: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <Dither name={art} tone="muted" />
      <h3 className="mt-5 font-display text-lg">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-ink-2">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Eyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("font-mono text-[11px] tracking-[0.14em] text-ink-3 uppercase", className)}
      {...props}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative overflow-hidden bg-sunken", className)}>
      <DitherFill level={12} tone="line" className="grain absolute inset-0" />
      <DitherFill level={50} tone="line" className="sweep absolute inset-y-0 left-0 w-1/4" />
    </div>
  );
}

const ring = [0, 1, 2, 5, 8, 7, 6, 3];

export function Spinner({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <span role="status" aria-label={label} className={cn("inline-grid size-3 grid-cols-3 gap-px", className)}>
      {Array.from({ length: 9 }, (_, i) => {
        const step = ring.indexOf(i);
        return (
          <span
            key={i}
            className={step < 0 ? "" : "spin-cell bg-line-strong"}
            style={step < 0 ? undefined : { animationDelay: `${step * 0.12}s` }}
          />
        );
      })}
    </span>
  );
}
