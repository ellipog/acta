"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { playgroundSources } from "@/lib/dither-assets";
import { Button } from "@/components/ui/button";
import { ColorPicker, type ColorValue } from "@/components/ui/color-picker";
import { Checkbox, Segmented, Slider } from "@/components/ui/controls";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

function bayer(n: number): number[][] {
  if (n === 1) return [[0]];
  const half = bayer(n / 2);
  const size = half.length;
  const m = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = half[y][x] * 4;
      m[y][x] = v;
      m[y][x + size] = v + 2;
      m[y + size][x] = v + 3;
      m[y + size][x + size] = v + 1;
    }
  }
  return m;
}

type Settings = {
  file: string;
  width: number;
  matrix: 0 | 2 | 4 | 8;
  lo: number;
  hi: number;
  gamma: number;
  invert: boolean;
  normalize: boolean;
  tone: ColorValue;
};

const initial: Settings = {
  file: playgroundSources[0].file,
  width: 320,
  matrix: 4,
  lo: 0,
  hi: 255,
  gamma: 1.4,
  invert: false,
  normalize: true,
  tone: "lapis",
};

export function DitherPlayground() {
  const [s, setS] = useState(initial);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = `/dither/src/${s.file}`;
  }, [s.file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const w = s.width;
    const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    const frame = ctx.getImageData(0, 0, w, h);
    const px = frame.data;

    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      gray[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
    }
    if (s.normalize) {
      const sorted = Float32Array.from(gray).sort();
      const lo = sorted[Math.floor(sorted.length * 0.01)];
      const hi = sorted[Math.floor(sorted.length * 0.99)];
      for (let i = 0; i < gray.length; i++) gray[i] = ((gray[i] - lo) / Math.max(1, hi - lo)) * 255;
    }

    const m = s.matrix ? bayer(s.matrix) : [[0]];
    const n = m.length;
    const ink = s.tone.startsWith("#") ? s.tone : getComputedStyle(canvas).getPropertyValue(`--${s.tone}`).trim();
    const [r, g, b] = hexToRgb(ink);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let v = Math.min(1, Math.max(0, (gray[i] - s.lo) / Math.max(1, s.hi - s.lo)));
        v = Math.pow(v, 1 / s.gamma);
        if (s.invert) v = 1 - v;
        const on = v < (m[y % n][x % n] + 0.5) / (n * n);
        px[i * 4] = r;
        px[i * 4 + 1] = g;
        px[i * 4 + 2] = b;
        px[i * 4 + 3] = on ? 255 : 0;
      }
    }
    ctx.putImageData(frame, 0, 0);
  }, [img, s]);

  const recipe = useMemo(() => {
    const parts = [
      `name: "my-image"`,
      `source: "${s.file}"`,
      `width: ${s.width}`,
      `matrix: ${s.matrix}`,
      s.normalize && `normalize: true`,
      (s.lo !== 0 || s.hi !== 255) && `levels: [${s.lo}, ${s.hi}]`,
      s.gamma !== 1 && `gamma: ${s.gamma}`,
      s.invert && `invert: true`,
    ].filter(Boolean);
    return `{ ${parts.join(", ")} },`;
  }, [s]);

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pg-source">Source</Label>
          <Select
            id="pg-source"
            value={s.file}
            onValueChange={(v) => set("file", v)}
            options={playgroundSources.map((src) => ({ value: src.file, label: src.label }))}
          />
        </div>
        <Range label="Width" value={s.width} min={80} max={640} step={10} onChange={(v) => set("width", v)} suffix="px" />
        <div className="flex flex-col gap-1.5">
          <Label>Bayer matrix</Label>
          <Segmented
            aria-label="Bayer matrix"
            value={String(s.matrix)}
            onValueChange={(v) => set("matrix", Number(v) as Settings["matrix"])}
            options={[0, 2, 4, 8].map((v) => ({ value: String(v), label: v === 0 ? "line" : `${v}×${v}` }))}
          />
        </div>
        <Range label="Black point" value={s.lo} min={0} max={250} step={1} onChange={(v) => set("lo", Math.min(v, s.hi - 5))} />
        <Range label="White point" value={s.hi} min={5} max={255} step={1} onChange={(v) => set("hi", Math.max(v, s.lo + 5))} />
        <Range label="Gamma" value={s.gamma} min={0.4} max={3} step={0.1} onChange={(v) => set("gamma", v)} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pg-tone">Ink</Label>
          <ColorPicker id="pg-tone" custom value={s.tone} onChange={(v) => set("tone", v)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={s.normalize} onCheckedChange={(v) => set("normalize", v === true)} />
          Auto contrast
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={s.invert} onCheckedChange={(v) => set("invert", v === true)} />
          Invert
        </label>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-h-80 items-center justify-center overflow-auto border border-line bg-surface p-4">
          <canvas
            ref={canvasRef}
            className="max-w-full"
            style={{ imageRendering: "pixelated", width: s.width * 2 }}
          />
        </div>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate border border-line bg-sunken px-3 py-2 font-mono text-xs text-ink-2">
            {recipe}
          </code>
          <Button
            size="icon"
            aria-label="Copy recipe"
            onClick={() => {
              navigator.clipboard.writeText(recipe);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? <Icon name="check" /> : <Icon name="copy" />}
          </Button>
        </div>
        <p className="text-xs text-ink-3">
          Paste the recipe into <code className="font-mono">assets/dither.config.mjs</code>, rename it, and run{" "}
          <code className="font-mono">bun run dither</code>. Sources live in{" "}
          <code className="font-mono">assets/source</code>; add a crop there if you need one.
        </p>
      </div>
    </div>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between">
        <Label>{label}</Label>
        <span className="font-mono text-xs text-ink-2">
          {step < 1 ? value.toFixed(1) : value}
          {suffix}
        </span>
      </div>
      <Slider aria-label={label} value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
