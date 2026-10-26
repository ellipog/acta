"use client";

import { Popover as P } from "radix-ui";
import { Surface } from "./surface";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;

export function PopoverContent({ className, children, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content sideOffset={6} align="start" collisionPadding={12} className="z-50 outline-none" {...props}>
        <Surface className={className}>{children}</Surface>
      </P.Content>
    </P.Portal>
  );
}
