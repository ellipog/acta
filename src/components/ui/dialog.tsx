"use client";

import { Dialog as D } from "radix-ui";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { DitherFill } from "./dither";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-ink/20">
        <DitherFill level={25} tone="ink" className="absolute inset-0 opacity-30" />
      </D.Overlay>
      <D.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 focus:outline-none",
          className,
        )}
        {...props}
      >
        <div className="relative isolate">
          <DitherFill level={50} className="absolute inset-0 -z-10 translate-x-2 translate-y-2" />
          <div className="border border-line-strong bg-raised">
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <D.Title className="font-display text-lg">{title}</D.Title>
                {description ? (
                  <D.Description className="mt-0.5 text-sm text-ink-2">{description}</D.Description>
                ) : null}
              </div>
              <D.Close className="-m-1 p-1 text-ink-3 hover:bg-sunken hover:text-ink" aria-label="Close">
                <Icon name="x" />
              </D.Close>
            </div>
            <div className="px-5 py-4">{children}</div>
          </div>
        </div>
      </D.Content>
    </D.Portal>
  );
}

export function SheetContent({
  side = "left",
  title,
  className,
  children,
  ...props
}: React.ComponentProps<typeof D.Content> & { side?: "left" | "right"; title: string }) {
  return (
    <D.Portal>
      <D.Overlay className="sheet-overlay fixed inset-0 z-40 bg-ink/20">
        <DitherFill level={25} tone="ink" className="absolute inset-0 opacity-30" />
      </D.Overlay>
      <D.Content
        aria-describedby={undefined}
        data-side={side}
        className={cn(
          "sheet fixed inset-y-0 z-50 flex w-[min(20rem,calc(100%-3rem))] flex-col bg-surface focus:outline-none",
          side === "left" ? "left-0 border-r border-ink" : "right-0 border-l border-ink",
          className,
        )}
        {...props}
      >
        <D.Title className="sr-only">{title}</D.Title>
        <DitherFill
          level={50}
          tone="ink"
          className={cn("absolute inset-y-0 w-1.5 opacity-60", side === "left" ? "-right-[7px]" : "-left-[7px]")}
        />
        {children}
      </D.Content>
    </D.Portal>
  );
}
