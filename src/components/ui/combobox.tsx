"use client";

import { useState } from "react";
import { Command } from "cmdk";
import { cn } from "@/lib/utils";
import { Icon } from "./icons";
import { Popover, PopoverContent, PopoverTrigger } from "./overlays";
import { PixelCaret, PixelCheck } from "./pixel";
import type { SelectOption } from "./select";

const triggers = {
  field:
    "h-9 w-full border border-line-strong bg-raised px-3 text-sm hover:border-ink-3 focus-visible:border-lapis focus-visible:ring-2 focus-visible:ring-lapis/25 data-[state=open]:border-lapis",
  ghost: "h-8 w-full border border-transparent px-1.5 text-sm hover:border-line-strong focus-visible:border-lapis data-[state=open]:border-lapis",
  cell: "h-full w-full px-3 text-sm",
};

type Shared = {
  placeholder?: string;
  searchPlaceholder?: string;
  empty?: string;
  variant?: keyof typeof triggers;
  id?: string;
  className?: string;
  tabIndex?: number;
  "aria-label"?: string;
};

function Trigger({
  variant = "field",
  id,
  className,
  tabIndex,
  "aria-label": ariaLabel,
  children,
}: Shared & { children: React.ReactNode }) {
  return (
    <PopoverTrigger
      id={id}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      className={cn("group flex min-w-0 items-center gap-2 text-left text-ink outline-none transition-colors", triggers[variant], className)}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">{children}</span>
      <PixelCaret
        className={cn(
          "text-ink-3 group-data-[state=open]:rotate-180",
          variant === "cell" && "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:opacity-100",
        )}
      />
    </PopoverTrigger>
  );
}

function match(value: string, search: string, keywords?: string[]) {
  const hay = [value, ...(keywords ?? [])].join(" ").toLowerCase();
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.every((w) => hay.includes(w))) return 0;
  return (keywords?.[0] ?? value).toLowerCase().startsWith(words[0] ?? "") ? 1 : 0.5;
}

function List<V extends string>({
  options,
  isOn,
  onPick,
  searchPlaceholder = "Search…",
  empty = "Nothing matches",
  multi,
  footer,
}: {
  options: SelectOption<V>[];
  isOn: (v: V) => boolean;
  onPick: (v: V) => void;
  searchPlaceholder?: string;
  empty?: string;
  multi?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <Command loop filter={match} className="w-full">
      <div className="flex h-9 items-center gap-2 border-b border-line px-2.5">
        <Icon name="search" size="sm" className="text-ink-3" />
        <Command.Input
          autoFocus
          placeholder={searchPlaceholder}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
        />
      </div>
      <Command.List className="max-h-64 overflow-y-auto p-1">
        <Command.Empty className="px-2 py-6 text-center text-xs text-ink-3">{empty}</Command.Empty>
        {options.map((o) => {
          const on = isOn(o.value);
          return (
            <Command.Item
              key={o.value}
              value={o.value}
              keywords={[o.label]}
              onSelect={() => onPick(o.value)}
              className="relative flex h-8 cursor-default items-center gap-2 px-2 text-sm text-ink outline-none select-none data-[selected=true]:bg-sunken"
            >
              {multi ? (
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center border",
                    on ? "border-lapis bg-lapis text-on-accent" : "border-line-strong bg-raised",
                  )}
                >
                  {on ? <PixelCheck /> : null}
                </span>
              ) : null}
              {o.icon}
              <span className={cn("truncate", o.muted && "text-ink-3")}>{o.label}</span>
              {o.hint ? <span className="ml-auto shrink-0 pl-3 font-mono text-[11px] text-ink-3">{o.hint}</span> : null}
              {!multi && on ? <PixelCheck className={cn("text-lapis", o.hint ? "ml-2" : "ml-auto")} /> : null}
            </Command.Item>
          );
        })}
      </Command.List>
      {footer}
    </Command>
  );
}

export function Combobox<V extends string>({
  value,
  onValueChange,
  options,
  placeholder = "Choose…",
  ...shared
}: Shared & {
  value: V | undefined;
  onValueChange: (value: V) => void;
  options: SelectOption<V>[];
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Trigger {...shared}>
        {current ? (
          <>
            {current.icon}
            <span className={cn("truncate", current.muted && "text-ink-3")}>{current.label}</span>
          </>
        ) : (
          <span className="truncate text-ink-3">{placeholder}</span>
        )}
      </Trigger>
      <PopoverContent className="w-[max(var(--radix-popover-trigger-width),15rem)]">
        <List
          options={options}
          isOn={(v) => v === value}
          onPick={(v) => {
            onValueChange(v);
            setOpen(false);
          }}
          searchPlaceholder={shared.searchPlaceholder}
          empty={shared.empty}
        />
      </PopoverContent>
    </Popover>
  );
}

export function MultiSelect<V extends string>({
  value,
  onValueChange,
  options,
  placeholder = "None",
  renderValue,
  ...shared
}: Shared & {
  value: V[];
  onValueChange: (value: V[]) => void;
  options: SelectOption<V>[];
  renderValue?: (chosen: SelectOption<V>[]) => React.ReactNode;
}) {
  const chosen = options.filter((o) => value.includes(o.value));
  return (
    <Popover>
      <Trigger {...shared}>
        {chosen.length ? (
          (renderValue?.(chosen) ?? <span className="truncate">{chosen.map((o) => o.label).join(", ")}</span>)
        ) : (
          <span className="truncate text-ink-3">{placeholder}</span>
        )}
      </Trigger>
      <PopoverContent className="w-[max(var(--radix-popover-trigger-width),15rem)]">
        <List
          multi
          options={options}
          isOn={(v) => value.includes(v)}
          onPick={(v) => onValueChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])}
          searchPlaceholder={shared.searchPlaceholder}
          empty={shared.empty}
          footer={
            value.length ? (
              <div className="flex items-center justify-between border-t border-line px-2.5 py-1.5 text-[11px] text-ink-3">
                <span className="font-mono">{value.length} chosen</span>
                <button onClick={() => onValueChange([])} className="hover:text-hematite">
                  Clear
                </button>
              </div>
            ) : null
          }
        />
      </PopoverContent>
    </Popover>
  );
}
