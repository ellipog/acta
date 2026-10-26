"use client";

import { Tabs as Tb } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = Tb.Root;
export const TabsContent = Tb.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof Tb.List>) {
  return <Tb.List className={cn("flex border-b border-line", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof Tb.Trigger>) {
  return (
    <Tb.Trigger
      className={cn(
        "-mb-px flex h-9 items-center gap-2 border-b-2 border-transparent px-3 text-sm text-ink-2 hover:text-ink data-[state=active]:border-lapis data-[state=active]:text-ink [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}
