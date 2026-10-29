import { DitherFill, type DitherTone } from "@/components/ui/dither";
import { cn } from "@/lib/utils";

export function SectionMark({
  n,
  rock,
  base,
  tone,
  level,
  className,
}: {
  n: string;
  rock: string;
  base: string;
  tone: DitherTone;
  level: 12 | 25 | 50 | 75;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5 font-mono text-[11px] tracking-[0.16em] text-ink-3 uppercase", className)}>
      <span className="relative size-3.5 border border-line-strong" style={{ background: `var(--${base})` }}>
        <DitherFill level={level} tone={tone} className="absolute inset-0" />
      </span>
      {n} · {rock}
    </div>
  );
}

// What a section is about in plain words, under its heading
export function Plain({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mt-3 font-mono text-xs leading-relaxed text-ink", className)}>{children}</p>;
}

export function Fig({
  n,
  title,
  prefix = "Fig.",
  as: Tag = "figcaption",
  children,
  className,
}: {
  n: string;
  title: string;
  prefix?: string;
  as?: "figcaption" | "p";
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Tag className={cn("font-caption text-[15px] leading-snug text-ink-2", className)}>
      <span className="text-ink">
        {prefix} {n}.
      </span>{" "}
      — {title}
      {children ? <span className="text-ink-3"> {children}</span> : null}
    </Tag>
  );
}
