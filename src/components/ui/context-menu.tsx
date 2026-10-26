"use client";

import { ContextMenu as C } from "radix-ui";
import { cn } from "@/lib/utils";
import { menuContent, menuItem } from "./menu-styles";
import { PixelArrow, PixelCheck } from "./pixel";
import { Surface } from "./surface";

export const ContextMenu = C.Root;
export const ContextMenuTrigger = C.Trigger;
export const ContextMenuSub = C.Sub;
export const ContextMenuRadioGroup = C.RadioGroup;

export function ContextMenuContent({ className, children, ...props }: React.ComponentProps<typeof C.Content>) {
  return (
    <C.Portal>
      <C.Content className={menuContent} {...props}>
        <Surface className={cn("p-1", className)}>{children}</Surface>
      </C.Content>
    </C.Portal>
  );
}

export function ContextMenuItem({
  className,
  danger,
  ...props
}: React.ComponentProps<typeof C.Item> & { danger?: boolean }) {
  return <C.Item className={cn(menuItem, danger && "text-hematite [&>svg]:text-hematite", className)} {...props} />;
}

export function ContextMenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof C.SubTrigger>) {
  return (
    <C.SubTrigger className={cn(menuItem, className)} {...props}>
      {children}
      <PixelArrow className="ml-auto text-ink-3" />
    </C.SubTrigger>
  );
}

export function ContextMenuSubContent({ className, children, ...props }: React.ComponentProps<typeof C.SubContent>) {
  return (
    <C.Portal>
      <C.SubContent sideOffset={6} alignOffset={-5} className={menuContent} {...props}>
        <Surface className={cn("p-1", className)}>{children}</Surface>
      </C.SubContent>
    </C.Portal>
  );
}

export function ContextMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof C.RadioItem>) {
  return (
    <C.RadioItem className={cn(menuItem, "pr-7", className)} {...props}>
      {children}
      <C.ItemIndicator className="absolute right-2 text-lapis">
        <PixelCheck />
      </C.ItemIndicator>
    </C.RadioItem>
  );
}

export function ContextMenuSeparator() {
  return <C.Separator className="-mx-1 my-1 h-px bg-line" />;
}

export function ContextMenuLabel({ className, ...props }: React.ComponentProps<typeof C.Label>) {
  return <C.Label className={cn("px-2 pt-1.5 pb-1 font-mono text-[11px] text-ink-3", className)} {...props} />;
}
