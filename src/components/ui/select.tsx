"use client";

import { Select as S } from "radix-ui";
import { cn } from "@/lib/utils";
import { Surface } from "./overlays";
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
  return (
    <S.Root value={value} onValueChange={(v) => onValueChange(v as V)} disabled={disabled}>
      <S.Trigger
        id={id}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        className={cn(
          "group flex min-w-0 items-center gap-2 text-left text-ink outline-none transition-colors disabled:opacity-50 data-[placeholder]:text-ink-3 data-[state=open]:border-lapis",
          triggers[variant],
          current?.muted && "text-ink-3",
          className,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate [&>span]:flex [&>span]:min-w-0 [&>span]:items-center [&>span]:gap-2">
          <S.Value placeholder={placeholder} />
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
                    <span className="flex items-center gap-2">
                      {o.icon}
                      <span className={cn("truncate", o.muted && "text-ink-3")}>{o.label}</span>
                    </span>
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
    </S.Root>
  );
}
