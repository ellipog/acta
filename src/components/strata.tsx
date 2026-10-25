"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type Stratum = {
  tone: string;
  density: number;
  thickness: number;
  base?: string;
  texture?: number;
  rough?: number;
};

const B4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

function noise1(x: number, seed: number) {
  const x0 = Math.floor(x);
  const t = smooth(x - x0);
  const a = hash(x0, seed);
  const b = hash(x0 + 1, seed);
  return a + (b - a) * t;
}

function noise2(x: number, y: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = smooth(x - x0);
  const sy = smooth(y - y0);
  const a = hash(x0 + seed * 101, y0);
  const b = hash(x0 + 1 + seed * 101, y0);
  const c = hash(x0 + seed * 101, y0 + 1);
  const d = hash(x0 + 1 + seed * 101, y0 + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

function resolveColors(el: HTMLElement, names: string[]) {
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const styles = getComputedStyle(el);
  const out = new Map<string, [number, number, number]>();
  for (const name of names) {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = "#000";
    probe.fillStyle = styles.getPropertyValue(`--${name}`).trim() || "#000";
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    out.set(name, [r, g, b]);
  }
  return out;
}

export function Strata({
  layers,
  cell = 3,
  roughness = 3,
  seed = 1,
  className,
  children,
}: {
  layers: Stratum[];
  cell?: number;
  roughness?: number;
  seed?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const height = layers.reduce((sum, l) => sum + l.thickness, 0);
  // Callers pass fresh array literals, so key on the contents
  const spec = JSON.stringify(layers);

  useEffect(() => {
    const layers: Stratum[] = JSON.parse(spec);
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const draw = () => {
      const cols = Math.ceil(wrap.clientWidth / cell);
      const rows = Math.ceil(height / cell);
      if (cols === 0) return;
      canvas.width = cols;
      canvas.height = rows;
      canvas.style.width = `${cols * cell}px`;
      canvas.style.height = `${rows * cell}px`;

      const colors = resolveColors(wrap, [...new Set(layers.flatMap((l) => (l.base ? [l.tone, l.base] : [l.tone])))]);

      const tops: Float32Array[] = [];
      let acc = 0;
      layers.forEach((layer, i) => {
        const row = new Float32Array(cols);
        const base = acc / cell;
        const amp = i === 0 ? 0 : (layer.rough ?? roughness);
        for (let x = 0; x < cols; x++) {
          const n = noise1(x * 0.045, seed * 7 + i * 13) * 0.7 + noise1(x * 0.16, seed * 7 + i * 13 + 5) * 0.3;
          row[x] = base + (n - 0.5) * 2 * amp;
        }
        tops.push(row);
        acc += layer.thickness;
      });

      const ctx = canvas.getContext("2d")!;
      const img = ctx.createImageData(cols, rows);
      const px = img.data;
      for (let x = 0; x < cols; x++) {
        let li = 0;
        for (let y = 0; y < rows; y++) {
          while (li + 1 < layers.length && y >= tops[li + 1][x]) li++;
          const layer = layers[li];
          let density = layer.density;
          if (layer.texture) density += (noise2(x / 14, y / 2.5, seed + li) - 0.5) * layer.texture;
          const on = (B4[y % 4][x % 4] + 0.5) / 16 < density;
          const color = on ? colors.get(layer.tone) : layer.base ? colors.get(layer.base) : undefined;
          if (!color) continue;
          const k = (y * cols + x) * 4;
          px[k] = color[0];
          px[k + 1] = color[1];
          px[k + 2] = color[2];
          px[k + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [spec, cell, roughness, seed, height]);

  return (
    <div ref={wrapRef} className={cn("relative overflow-hidden", className)} style={{ height }}>
      <canvas ref={canvasRef} aria-hidden className="absolute top-0 left-0 [image-rendering:pixelated]" />
      {children}
    </div>
  );
}

export function Contact({
  from,
  to,
  seed = 1,
  className,
}: {
  from: string;
  to: string;
  seed?: number;
  className?: string;
}) {
  return (
    <Strata
      seed={seed}
      roughness={4}
      className={className}
      layers={[
        { tone: from, density: 1, thickness: 6 },
        { tone: to, density: 0.08, thickness: 10, base: from, texture: 0.15 },
        { tone: to, density: 0.3, thickness: 10, base: from, texture: 0.3 },
        { tone: to, density: 0.62, thickness: 10, base: from, texture: 0.3 },
        { tone: to, density: 1, thickness: 8 },
      ]}
    />
  );
}
