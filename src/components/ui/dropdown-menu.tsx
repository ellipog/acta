"use client";

import { DropdownMenu as M } from "radix-ui";
import { cn } from "@/lib/utils";
import { menuContent, menuItem } from "./menu-styles";
import { PixelArrow, PixelCheck } from "./pixel";
import { Surface } from "./surface";

export function DropdownMenu(props: React.ComponentProps<typeof M.Root>) {
  return <M.Root modal={false} {...props} />;
}
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuSub = M.Sub;
export const DropdownMenuRadioGroup = M.RadioGroup;

export function DropdownMenuContent({ className, children, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content sideOffset={6} className={menuContent} {...props}>
        <Surface className={cn("p-1", className)}>{children}</Surface>
      </M.Content>
    </M.Portal>
  );
}

export function DropdownMenuItem({
  className,
  danger,
  ...props
}: React.ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return <M.Item className={cn(menuItem, danger && "text-hematite [&>svg]:text-hematite", className)} {...props} />;
}

export function DropdownMenuSeparator() {
  return <M.Separator className="-mx-1 my-1 h-px bg-line" />;
}

export function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn(menuItem, "pr-7", className)} {...props}>
      {children}
      <M.ItemIndicator className="absolute right-2 text-lapis">
        <PixelCheck />
      </M.ItemIndicator>
    </M.RadioItem>
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  onSelect,
  ...props
}: React.ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem
      className={cn(menuItem, "group/item", className)}
      onSelect={(e) => {
        e.preventDefault();
        onSelect?.(e);
      }}
      {...props}
    >
      <span className="grid size-4 shrink-0 place-items-center border border-line-strong bg-raised text-on-accent group-data-[state=checked]/item:border-lapis group-data-[state=checked]/item:bg-lapis">
        <M.ItemIndicator>
          <PixelCheck />
        </M.ItemIndicator>
      </span>
      {children}
    </M.CheckboxItem>
  );
}

export function DropdownMenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof M.SubTrigger>) {
  return (
    <M.SubTrigger className={cn(menuItem, className)} {...props}>
      {children}
      <PixelArrow className="ml-auto text-ink-3" />
    </M.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, children, ...props }: React.ComponentProps<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent sideOffset={6} alignOffset={-5} collisionPadding={12} className={menuContent} {...props}>
        <Surface className={cn("p-1", className)}>{children}</Surface>
      </M.SubContent>
    </M.Portal>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2 pt-1.5 pb-1 text-[11px] text-ink-3", className)} {...props} />;
}
