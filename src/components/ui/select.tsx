"use client";

import { useRef, useState } from "react";
import { Select as S } from "radix-ui";
import { cn } from "@/lib/utils";
import { Surface } from "./surface";
import { PixelCaret, PixelCheck } from "./pixel";

export type SelectOption<V extends string = string> = {
  value: V;
  label: string;
  icon?: React.ReactNode;
  hint?: string;
  muted?: boolean;
};

const triggers = {
  field:
    "h-9 w-full border border-line-strong bg-raised px-3 text-sm hover:border-ink-3 focus-visible:border-lapis focus-visible:ring-2 focus-visible:ring-lapis/25",
  ghost: "h-8 w-full border border-transparent px-1.5 text-sm hover:border-line-strong focus-visible:border-lapis",
  compact: "h-7 border border-line bg-raised px-2 text-xs hover:border-line-strong focus-visible:border-lapis",
  cell: "h-full w-full px-3 text-sm",
};

// Typing on a closed trigger picks the next option whose label starts with what was typed, as Radix does with
// its items. A single letter pressed again moves on to the next match
function nextMatch<V extends string>(options: SelectOption<V>[], value: V | undefined, text: string) {
  const repeat = [...text].every((c) => c === text[0]);
  const search = repeat ? text[0] : text;
  const at = Math.max(0, options.findIndex((o) => o.value === value));
  const from = repeat ? at + 1 : at;
  const order = [...options.slice(from), ...options.slice(0, from)];
  return order.find((o) => o.label.toLowerCase().startsWith(search));
}

export function Select<V extends string>({
  value,
  onValueChange,
  options,
  placeholder = "Choose…",
  variant = "field",
  id,
  className,
  disabled,
  tabIndex,
  "aria-label": ariaLabel,
}: {
  value: V | undefined;
  onValueChange: (value: V) => void;
  options: SelectOption<V>[];
  placeholder?: string;
  variant?: keyof typeof triggers;
  id?: string;
  className?: string;
  disabled?: boolean;
  tabIndex?: number;
  "aria-label"?: string;
}) {
  const cell = variant === "cell";
  const current = options.find((o) => o.value === value);
  // Radix renders a closed Select's whole option list into a detached fragment, so its value can copy the chosen
  // item's text. A table row holds five of these, so the list mounts only while open and the value draws itself
  const [open, setOpen] = useState(false);
  const typed = useRef({ text: "", at: 0 });
  const typeahead = (e: React.KeyboardEvent) => {
    // The table turns typeahead off in its cells by preventing the key first
    if (open || e.defaultPrevented || e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    const now = Date.now();
    const going = now - typed.current.at > 1000 ? "" : typed.current.text;
    // Space opens the list, unless it's part of a label being typed, like "In progress". Then it's kept from
    // opening it, here and as the button's click
    if (e.key === " ") {
      if (!going) return;
      e.preventDefault();
    }
    const text = going + e.key.toLowerCase();
    typed.current = { text, at: now };
    const next = nextMatch(options, value, text);
    if (next && next.value !== value) onValueChange(next.value);
  };

  return (
    <S.Root
      value={value}
      onValueChange={(v) => onValueChange(v as V)}
      disabled={disabled}
      open={open}
      onOpenChange={setOpen}
    >
      <S.Trigger
        id={id}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        onKeyDown={typeahead}
        className={cn(
          "group flex min-w-0 items-center gap-2 text-left text-ink outline-none transition-colors disabled:opacity-50 data-[placeholder]:text-ink-3 data-[state=open]:border-lapis",
          triggers[variant],
          current?.muted && "text-ink-3",
          className,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate [&>span]:flex [&>span]:min-w-0 [&>span]:items-center [&>span]:gap-2">
          <S.Value placeholder={placeholder}>{current ? <OptionText option={current} /> : undefined}</S.Value>
        </span>
        <S.Icon asChild>
          <span
            className={cn(
              "text-ink-3 group-hover:text-ink-2",
              cell && "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:opacity-100",
            )}
          >
            <PixelCaret className="group-data-[state=open]:rotate-180" />
          </span>
        </S.Icon>
      </S.Trigger>
      {open ? (
        <S.Portal>
          <S.Content
            position="popper"
            sideOffset={4}
            collisionPadding={12}
            className="z-50 max-h-[var(--radix-select-content-available-height)] min-w-[max(var(--radix-select-trigger-width),10rem)] outline-none"
          >
            <Surface className="p-1">
              <S.Viewport className="max-h-72">
                {options.map((o) => (
                  <S.Item
                    key={o.value}
                    value={o.value}
                    className="relative flex h-8 cursor-default items-center gap-2 pr-8 pl-2 text-sm text-ink outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-sunken data-[state=checked]:font-medium"
                  >
                    <S.ItemText>
                      <OptionText option={o} />
                    </S.ItemText>
                    {o.hint ? <span className="ml-auto pl-3 font-mono text-[11px] text-ink-3">{o.hint}</span> : null}
                    <S.ItemIndicator className="absolute right-2 text-lapis">
                      <PixelCheck />
                    </S.ItemIndicator>
                  </S.Item>
                ))}
              </S.Viewport>
            </Surface>
          </S.Content>
        </S.Portal>
      ) : null}
    </S.Root>
  );
}

function OptionText({ option }: { option: SelectOption }) {
  return (
    <span className="flex items-center gap-2">
      {option.icon}
      <span className={cn("truncate", option.muted && "text-ink-3")}>{option.label}</span>
    </span>
  );
}
