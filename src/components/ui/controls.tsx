"use client";

import { useState } from "react";
import {
  Checkbox as CheckboxPrimitive,
  RadioGroup as RadioPrimitive,
  Slider as SliderPrimitive,
  Switch as SwitchPrimitive,
  ToggleGroup as ToggleGroupPrimitive,
} from "radix-ui";
import { cn } from "@/lib/utils";
import { DitherFill } from "./dither";
import { PixelMinus, PixelPlus } from "./pixel";

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer group/check grid size-4 shrink-0 place-items-center border border-line-strong bg-raised outline-none transition-colors hover:border-ink-3 focus-visible:ring-2 focus-visible:ring-lapis/40 data-[state=checked]:border-lapis data-[state=checked]:bg-lapis data-[state=indeterminate]:border-lapis data-[state=indeterminate]:bg-lapis",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="text-on-accent">
        <svg viewBox="0 0 7 5" className="h-[10px] w-[14px] fill-current group-data-[state=indeterminate]/check:hidden" shapeRendering="crispEdges" aria-hidden>
          <path d="M6 0h1v1H6zM5 1h1v1H5zM0 2h1v1H0zM4 2h1v1H4zM1 3h1v1H1zM3 3h1v1H3zM2 4h1v1H2z" />
        </svg>
        <svg viewBox="0 0 7 5" className="hidden h-[10px] w-[14px] fill-current group-data-[state=indeterminate]/check:block" shapeRendering="crispEdges" aria-hidden>
          <path d="M1 2h5v1H1z" />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

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

export function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbs = (props.value ?? props.defaultValue ?? [0]).length;
  const label = props["aria-label"];
  return (
    <SliderPrimitive.Root
      className={cn("relative flex h-5 w-full touch-none items-center select-none data-[disabled]:opacity-50", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow border border-line-strong bg-sunken">
        <SliderPrimitive.Range className="absolute h-full">
          <DitherFill level={75} tone="lapis" className="absolute inset-0" />
        </SliderPrimitive.Range>
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          aria-label={label}
          className="block size-3.5 border border-ink bg-raised outline-none transition-colors hover:bg-lapis-soft focus-visible:ring-2 focus-visible:ring-lapis/40 active:bg-lapis"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioPrimitive.Root>) {
  return <RadioPrimitive.Root className={cn("flex flex-col gap-2.5", className)} {...props} />;
}

export function Radio({
  value,
  children,
  hint,
  className,
}: {
  value: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-sm", className)}>
      <RadioPrimitive.Item
        value={value}
        className="peer mt-0.5 grid size-4 shrink-0 place-items-center border border-line-strong bg-raised outline-none transition-colors hover:border-ink-3 focus-visible:ring-2 focus-visible:ring-lapis/40 data-[state=checked]:border-lapis"
      >
        <RadioPrimitive.Indicator className="size-2 bg-lapis" />
      </RadioPrimitive.Item>
      <span>
        {children}
        {hint ? <span className="block text-xs text-ink-3">{hint}</span> : null}
      </span>
    </label>
  );
}

export function Segmented<V extends string>({
  value,
  onValueChange,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  value: V;
  onValueChange: (value: V) => void;
  options: { value: V; label: React.ReactNode }[];
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as V)}
      aria-label={ariaLabel}
      className={cn("grid auto-cols-fr grid-flow-col border border-line-strong", className)}
    >
      {options.map((o) => (
        <ToggleGroupPrimitive.Item
          key={o.value}
          value={o.value}
          className="h-8 border-r border-line-strong bg-raised font-mono text-xs text-ink-2 outline-none last:border-r-0 hover:bg-sunken focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-lapis data-[state=on]:bg-lapis data-[state=on]:text-on-accent"
        >
          {o.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

export function NumberField({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  suffix,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const set = (n: number) => {
    setDraft(null);
    onChange(clamp(n));
  };
  const commit = () => {
    if (draft !== null && draft.trim() !== "" && !Number.isNaN(Number(draft))) set(Number(draft));
    else setDraft(null);
  };
  const stepper = "grid w-8 shrink-0 place-items-center text-ink-2 hover:bg-sunken hover:text-ink disabled:opacity-30";

  return (
    <div
      className={cn(
        "flex h-9 border border-line-strong bg-raised transition-colors focus-within:border-lapis focus-within:ring-2 focus-within:ring-lapis/25 hover:border-ink-3",
        className,
      )}
    >
      <button type="button" tabIndex={-1} aria-label="Decrease" disabled={value <= min} onClick={() => set(value - step)} className={cn(stepper, "border-r border-line")}>
        <PixelMinus />
      </button>
      <input
        id={id}
        role="spinbutton"
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-valuenow={value}
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            set(value + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
          } else if (e.key === "Enter") commit();
          else if (e.key === "Escape") setDraft(null);
        }}
        className="w-full min-w-0 bg-transparent text-center font-mono text-sm outline-none"
      />
      {suffix ? <span className="self-center pr-2 text-xs text-ink-3">{suffix}</span> : null}
      <button type="button" tabIndex={-1} aria-label="Increase" disabled={value >= max} onClick={() => set(value + step)} className={cn(stepper, "border-l border-line")}>
        <PixelPlus />
      </button>
    </div>
  );
}
