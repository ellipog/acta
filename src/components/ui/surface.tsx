import { cn } from "@/lib/utils";
import { DitherFill } from "./dither";

export function Surface({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="relative isolate">
      <DitherFill level={50} tone="ink" className="absolute inset-0 -z-10 translate-x-1 translate-y-1 opacity-60" />
      <div className={cn("border border-ink bg-raised", className)}>{children}</div>
    </div>
  );
}
