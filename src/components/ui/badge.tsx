import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 border px-1.5 py-px text-[11px] leading-4 font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        stone: "border-line bg-sunken text-ink-2",
        lapis: "border-lapis/30 bg-lapis-soft text-lapis-ink",
        pyrite: "border-pyrite/40 bg-pyrite-soft text-pyrite-ink",
        malachite: "border-malachite/30 bg-malachite-soft text-malachite-ink",
        hematite: "border-hematite/30 bg-hematite-soft text-hematite-ink",
        outline: "border-line-strong bg-transparent text-ink-2",
      },
    },
    defaultVariants: { tone: "stone" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center border border-b-2 border-line-strong bg-raised px-1 font-mono text-[11px] text-ink-2",
        className,
      )}
      {...props}
    />
  );
}
