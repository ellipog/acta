"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DitherFill } from "./dither";
import { Popover, PopoverContent, PopoverTrigger } from "./overlays";
import { PixelCaret, PixelCheck } from "./pixel";

export type ColorValue = string;

export const minerals: { name: string; value: ColorValue }[] = [
  { name: "Lapis", value: "lapis" },
  { name: "Pyrite", value: "pyrite" },
  { name: "Malachite", value: "malachite" },
  { name: "Hematite", value: "hematite" },
  { name: "Basalt", value: "ink" },
  { name: "Slate", value: "ink-3" },
];

export const paint = (v: ColorValue) => (v.startsWith("#") ? v : `var(--${v})`);
const nameOf = (v: ColorValue) => minerals.find((m) => m.value === v)?.name ?? v.toUpperCase();

export function Swatch({ value, className }: { value: ColorValue; className?: string }) {
  return (
    <span className={cn("relative block size-5 shrink-0 overflow-hidden border border-ink/20", className)}>
      <span className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: paint(value) }} />
      <DitherFill level={50} className="absolute inset-x-0 top-0 h-1/2" style={{ ["--dither" as string]: paint(value) }} />
    </span>
  );
}

type Hsv = { h: number; s: number; v: number };

function hsvToRgb({ h, s, v }: Hsv): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

const toHex = (rgb: number[]) => "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

const B4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function paintField(canvas: HTMLCanvasElement, color: (x: number, y: number) => [number, number, number]) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const L = 5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = (B4[y % 4][x % 4] + 0.5) / 16;
      const rgb = color(x / (w - 1), y / (h - 1));
      const k = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const q = (rgb[c] / 255) * (L - 1);
        const base = Math.floor(q);
        img.data[k + c] = (Math.min(L - 1, base + (q - base > t ? 1 : 0)) / (L - 1)) * 255;
      }
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function CustomColor({ value, onChange }: { value: ColorValue; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => (value.startsWith("#") ? rgbToHsv(...fromHex(value)) : { h: 222, s: 0.69, v: 0.55 }));
  const [draft, setDraft] = useState(() => (value.startsWith("#") ? value : toHex(hsvToRgb(hsv))));
  const fieldRef = useRef<HTMLCanvasElement>(null);
  const hueRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (fieldRef.current) paintField(fieldRef.current, (x, y) => hsvToRgb({ h: hsv.h, s: x, v: 1 - y }));
  }, [hsv.h]);
  useEffect(() => {
    if (hueRef.current) paintField(hueRef.current, (x) => hsvToRgb({ h: x * 360, s: 1, v: 1 }));
  }, []);

  const commit = (next: Hsv) => {
    setHsv(next);
    const hex = toHex(hsvToRgb(next));
    setDraft(hex);
    onChange(hex);
  };

  const drag = (el: HTMLElement, e: React.PointerEvent, apply: (x: number, y: number) => void) => {
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent | React.PointerEvent) => {
      const r = el.getBoundingClientRect();
      apply(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)));
    };
    move(e);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const nudge = (e: React.KeyboardEvent, axis: "sv" | "h") => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!d) return;
    e.preventDefault();
    if (axis === "h") commit({ ...hsv, h: (hsv.h + (d[0] || d[1]) * step * 180 + 360) % 360 });
    else commit({ ...hsv, s: Math.min(1, Math.max(0, hsv.s + d[0] * step)), v: Math.min(1, Math.max(0, hsv.v + d[1] * step)) });
  };

  return (
    <div className="flex flex-col gap-2 border-t border-line p-3">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        onPointerDown={(e) => drag(e.currentTarget, e, (x, y) => commit({ ...hsv, s: x, v: 1 - y }))}
        onKeyDown={(e) => nudge(e, "sv")}
        className="relative h-28 w-full cursor-crosshair touch-none border border-line-strong outline-none focus-visible:ring-2 focus-visible:ring-lapis"
      >
        <canvas ref={fieldRef} width={96} height={56} className="size-full [image-rendering:pixelated]" />
        <span
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 border-2 border-page outline outline-ink"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onPointerDown={(e) => drag(e.currentTarget, e, (x) => commit({ ...hsv, h: x * 360 }))}
        onKeyDown={(e) => nudge(e, "h")}
        className="relative h-3 w-full cursor-ew-resize touch-none border border-line-strong outline-none focus-visible:ring-2 focus-visible:ring-lapis"
      >
        <canvas ref={hueRef} width={96} height={3} className="size-full [image-rendering:pixelated]" />
        <span
          className="pointer-events-none absolute -top-[3px] -bottom-[3px] w-1.5 -translate-x-1/2 border-2 border-page outline outline-ink"
          style={{ left: `${(hsv.h / 360) * 100}%` }}
        />
      </div>
      <label className="flex h-8 items-center gap-2 border border-line-strong bg-page px-2 focus-within:border-lapis">
        <span className="font-mono text-[11px] text-ink-3">HEX</span>
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value.trim();
            setDraft(v);
            if (/^#[0-9a-f]{6}$/i.test(v)) {
              setHsv(rgbToHsv(...fromHex(v)));
              onChange(v.toLowerCase());
            }
          }}
          spellCheck={false}
          aria-label="Hex color"
          className="w-full bg-transparent font-mono text-xs uppercase outline-none"
        />
      </label>
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
  custom,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  value: ColorValue;
  onChange: (value: ColorValue) => void;
  custom?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "group flex h-9 w-full items-center gap-2 border border-line-strong bg-raised px-2 text-left text-sm outline-none transition-colors hover:border-ink-3 focus-visible:border-lapis focus-visible:ring-2 focus-visible:ring-lapis/25 data-[state=open]:border-lapis",
          className,
        )}
      >
        <Swatch value={value} />
        <span className={cn("flex-1 truncate", value.startsWith("#") && "font-mono text-xs")}>{nameOf(value)}</span>
        <PixelCaret className="text-ink-3 group-data-[state=open]:rotate-180" />
      </PopoverTrigger>
      <PopoverContent className="w-60">
        <div role="radiogroup" aria-label="Minerals" className="grid grid-cols-6 gap-1.5 p-3">
          {minerals.map((m) => {
            const on = m.value === value;
            return (
              <button
                key={m.value}
                role="radio"
                aria-checked={on}
                aria-label={m.name}
                onClick={() => onChange(m.value)}
                className={cn(
                  "group/sw relative outline-none focus-visible:ring-2 focus-visible:ring-lapis focus-visible:ring-offset-2 focus-visible:ring-offset-raised",
                )}
              >
                <Swatch value={m.value} className={cn("size-8", on && "border-ink")} />
                {on ? (
                  <span className="absolute inset-0 grid place-items-center text-page">
                    <PixelCheck />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="-mt-1 px-3 pb-2 font-mono text-[10px] text-ink-3">{nameOf(value)}</p>
        {custom ? <CustomColor value={value} onChange={onChange} /> : null}
      </PopoverContent>
    </Popover>
  );
}
