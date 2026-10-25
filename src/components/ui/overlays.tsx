"use client";

import {
  ContextMenu as C,
  Dialog as D,
  DropdownMenu as M,
  Popover as P,
  Tooltip as T,
  Tabs as Tb,
} from "radix-ui";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { DitherFill } from "./dither";
import { PixelArrow, PixelCheck } from "./pixel";

export function Surface({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="relative isolate">
      <DitherFill level={50} tone="ink" className="absolute inset-0 -z-10 translate-x-1 translate-y-1 opacity-60" />
      <div className={cn("border border-ink bg-raised", className)}>{children}</div>
    </div>
  );
}

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

const menuItem =
  "relative flex h-8 cursor-default items-center gap-2 px-2 text-sm text-ink outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-sunken data-[state=open]:bg-sunken [&>svg]:text-ink-3";
const menuContent = "z-50 min-w-44 outline-none";

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

export const TooltipProvider = T.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={5} className="z-50 bg-ink px-2 py-1 text-xs text-page">
          {content}
          <T.Arrow asChild width={7} height={4}>
            <svg viewBox="0 0 7 4" shapeRendering="crispEdges" className="fill-ink">
              <path d="M0 0h7v1H0zM1 1h5v1H1zM2 2h3v1H2zM3 3h1v1H3z" />
            </svg>
          </T.Arrow>
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

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
