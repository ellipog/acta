"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

// On its own, so a page with only a switch, like the landing page, doesn't download the sliders, radios and
// checkboxes that share controls.tsx
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "group relative inline-flex h-5 w-9 shrink-0 items-center border border-line-strong bg-sunken p-0.5 transition-colors data-[state=checked]:border-lapis data-[state=checked]:bg-lapis",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="dither-50 absolute inset-0.5 [--dither:var(--line-strong)] group-data-[state=checked]:opacity-0" />
      <SwitchPrimitive.Thumb className="relative block size-3.5 border border-line-strong bg-raised transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:border-on-accent" />
    </SwitchPrimitive.Root>
  );
}
