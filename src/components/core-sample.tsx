"use client";

import { useEffect, useState } from "react";
import { DitherFill, type DitherTone } from "@/components/ui/dither";
import { cn } from "@/lib/utils";

export type CoreLayer = {
  id: string;
  label: string;
  rock: string;
  base: string;
  tone: DitherTone;
  level: 12 | 25 | 50 | 75;
};

export function CoreSample({ layers }: { layers: CoreLayer[] }) {
  const [sizes, setSizes] = useState<number[]>(() => layers.map(() => 1));
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(0);
  const [depth, setDepth] = useState(0);

  useEffect(() => {
    const measure = () => {
      setSizes(layers.map((l) => document.getElementById(l.id)?.offsetHeight ?? 1));
    };
    const onScroll = () => {
      const first = document.getElementById(layers[0].id);
      const last = document.getElementById(layers[layers.length - 1].id);
      if (!first || !last) return;
      const top = first.offsetTop;
      const bottom = last.offsetTop + last.offsetHeight;
      const probe = window.scrollY + window.innerHeight * 0.4;
      setProgress(Math.min(1, Math.max(0, (probe - top) / (bottom - top))));
      setDepth(Math.max(0, Math.round((probe - top) / 12)));
      let idx = 0;
      layers.forEach((l, i) => {
        const el = document.getElementById(l.id);
        if (el && el.offsetTop <= probe) idx = i;
      });
      setActive(idx);
    };
    measure();
    onScroll();
    const ro = new ResizeObserver(() => {
      measure();
      onScroll();
    });
    layers.forEach((l) => {
      const el = document.getElementById(l.id);
      if (el) ro.observe(el);
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [layers]);

  const total = sizes.reduce((a, b) => a + b, 0);

  return (
    <nav
      aria-label="Page sections"
      className="fixed top-1/2 left-5 z-20 hidden h-[62vh] -translate-y-1/2 xl:flex"
    >
      <div className="relative flex w-5 flex-col border border-line-strong">
        {layers.map((l, i) => (
          <a
            key={l.id}
            href={`#${l.id}`}
            aria-label={l.label}
            className="group relative block border-b border-line-strong last:border-b-0"
            style={{ height: `${(sizes[i] / total) * 100}%`, background: `var(--${l.base})` }}
          >
            <DitherFill level={l.level} tone={l.tone} className="absolute inset-0" />
            <span
              className={cn(
                "pointer-events-none absolute top-1/2 left-7 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] text-ink-3 opacity-0 transition-opacity group-hover:opacity-100",
                i === active && "opacity-0",
              )}
            >
              {l.rock}
            </span>
          </a>
        ))}
        <div
          className="pointer-events-none absolute -right-1.5 -left-1.5 h-px bg-hematite"
          style={{ top: `${progress * 100}%` }}
        >
          <div className="absolute top-1/2 left-[calc(100%+6px)] hidden -translate-y-1/2 whitespace-nowrap 2xl:block">
            <p className="font-mono text-[10px] text-hematite">−{String(depth).padStart(3, "0")} m</p>
            <p className="font-mono text-[10px] text-ink-3">{layers[active]?.rock}</p>
          </div>
        </div>
      </div>
    </nav>
  );
}
