"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { MONTHS } from "@/lib/dates";
import { cn } from "@/lib/utils";

// Charts in Acta's one-bit look: hard pixel lines over dithered fills, read out on hover or with the arrow keys

export type Tone = "lapis" | "pyrite" | "malachite" | "hematite" | "ink";

const toneVar: Record<Tone, string> = {
  lapis: "var(--lapis)",
  pyrite: "var(--pyrite)",
  malachite: "var(--malachite)",
  hematite: "var(--hematite)",
  ink: "var(--ink)",
};
const toneBg: Record<Tone, string> = {
  lapis: "bg-lapis",
  pyrite: "bg-pyrite",
  malachite: "bg-malachite",
  hematite: "bg-hematite",
  ink: "bg-ink",
};

const whole = new Intl.NumberFormat("en");
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const count = (n: number) => (n >= 10_000 ? compact.format(n) : whole.format(n));

function parts(t: string) {
  const [date, time] = t.split("T");
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d, time, month: MONTHS[m - 1], short: MONTHS[m - 1].slice(0, 3) };
}

export function axisLabel(t: string, bucket: string) {
  const p = parts(t);
  if (bucket === "hour") return p.time;
  if (bucket === "month") return p.m === 1 ? `${p.short} ’${String(p.y).slice(2)}` : p.short;
  return `${p.short} ${p.d}`;
}

export function longLabel(t: string, bucket: string) {
  const p = parts(t);
  const weekday = new Date(Date.UTC(p.y, p.m - 1, p.d)).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  if (bucket === "hour") return `${weekday} ${p.short} ${p.d}, ${p.time}`;
  if (bucket === "day") return `${weekday} ${p.short} ${p.d}`;
  if (bucket === "week") return `Week of ${p.short} ${p.d}`;
  return `${p.month} ${p.y}`;
}

export function niceTop(max: number) {
  for (let k = 1; ; k *= 10) for (const m of [1, 2, 4, 6, 8, 10]) if (m * k >= max) return m * k;
}

export function Delta({ now, before, upIsGood = true, points }: { now: number; before: number; upIsGood?: boolean; points?: boolean }) {
  if (!before && !now) return <span className="text-xs text-ink-3">No change</span>;
  if (!before) return <span className="text-xs text-ink-3">New this period</span>;
  const change = points ? (now - before) * 100 : ((now - before) / before) * 100;
  const rounded = Math.round(change);
  if (rounded === 0) return <span className="text-xs text-ink-3">Same as before</span>;
  const good = rounded > 0 === upIsGood;
  return (
    <span className={cn("flex items-center gap-1 text-xs", good ? "text-malachite" : "text-hematite")}>
      <Icon name={rounded > 0 ? "arrow-up" : "arrow-down"} size="sm" />
      {Math.abs(rounded)}
      {points ? " pts" : "%"}
    </span>
  );
}

// Where each value sits, in percent of the chart's width and height
const xAt = (i: number, n: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
const yAt = (v: number, top: number) => 100 - (top ? (v / top) * 100 : 0);

/** A dithered area under a line, clipped to the line's shape so the dither's pixels stay square at any width */
function Area({ values, top, tone, level }: { values: number[]; top: number; tone: Tone; level: 25 | 50 }) {
  const n = values.length;
  const edge = values.map((v, i) => `${xAt(i, n)}% ${yAt(v, top)}%`).join(", ");
  return (
    <span
      aria-hidden
      className={cn("absolute inset-0", level === 50 ? "dither-50" : "dither-25")}
      style={{ "--dither": toneVar[tone], clipPath: `polygon(${xAt(0, n)}% 100%, ${edge}, ${xAt(n - 1, n)}% 100%)` } as React.CSSProperties}
    />
  );
}

function Path({ values, top, tone, width = 2 }: { values: number[]; top: number; tone: Tone; width?: number }) {
  const n = values.length;
  return (
    <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
      <polyline
        points={values.map((v, i) => `${xAt(i, n)},${yAt(v, top)}`).join(" ")}
        fill="none"
        stroke={toneVar[tone]}
        strokeWidth={width}
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
        shapeRendering="crispEdges"
      />
    </svg>
  );
}

export type Line = { key: string; label: string; tone: Tone; values: number[]; area?: boolean };

/** A line chart over time, one line or several, with the first's area dithered in */
export function LineChart({
  slots,
  lines,
  bucket,
  height = "h-52",
  caption,
}: {
  slots: string[];
  lines: Line[];
  bucket: string;
  height?: string;
  caption?: React.ReactNode;
}) {
  const [active, setActive] = useState<number | null>(null);
  const n = slots.length;
  const top = niceTop(Math.max(1, ...lines.flatMap((l) => l.values)));
  const every = Math.max(1, Math.ceil(n / 7));
  const empty = lines.every((l) => l.values.every((v) => v === 0));

  return (
    <figure>
      <div className="grid grid-cols-[2.25rem_1fr] gap-2">
        <div className={cn("relative font-mono text-[10px] text-ink-3 tabular-nums", height)}>
          {[top, top / 2, 0].map((v, i) => (
            <span key={i} className="absolute right-0 -translate-y-1/2" style={{ top: `${i * 50}%` }}>
              {count(v)}
            </span>
          ))}
        </div>
        <div className="min-w-0">
          <div
            tabIndex={0}
            role="group"
            aria-label={`${lines.map((l) => l.label).join(", ")} per ${bucket}. Use the arrow keys to read each ${bucket}.`}
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
              e.preventDefault();
              setActive((i) => {
                if (e.key === "Home") return 0;
                if (e.key === "End") return n - 1;
                const from = i ?? n - 1;
                return Math.min(n - 1, Math.max(0, from + (e.key === "ArrowLeft" ? -1 : 1)));
              });
            }}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            className={cn(
              "relative outline-none focus-visible:ring-2 focus-visible:ring-lapis focus-visible:ring-offset-4 focus-visible:ring-offset-raised",
              height,
            )}
          >
            {[0, 50, 100].map((y) => (
              <span key={y} aria-hidden className="absolute inset-x-0 h-px bg-line" style={{ top: `${y}%` }} />
            ))}
            {!empty
              ? lines.map((l, i) => (l.area ? <Area key={l.key} values={l.values} top={top} tone={l.tone} level={i ? 25 : 50} /> : null))
              : null}
            {!empty ? lines.map((l) => <Path key={l.key} values={l.values} top={top} tone={l.tone} />) : null}

            {/* Where to point, one column per period */}
            <div className="absolute inset-0 flex">
              {slots.map((t, i) => (
                <span key={t} onPointerEnter={() => setActive(i)} className="h-full flex-1" />
              ))}
            </div>

            {active !== null ? (
              <>
                <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-ink/25" style={{ left: `${xAt(active, n)}%` }} />
                {lines.map((l) => (
                  <span
                    key={l.key}
                    aria-hidden
                    className={cn("pointer-events-none absolute size-2 -translate-1/2 border border-raised", toneBg[l.tone])}
                    style={{ left: `${xAt(active, n)}%`, top: `${yAt(l.values[active], top)}%` }}
                  />
                ))}
                <div
                  role="status"
                  className="pointer-events-none absolute -top-2 z-10 border border-ink bg-raised px-3 py-2 whitespace-nowrap shadow-[3px_3px_0_var(--line-strong)]"
                  style={{
                    left: `${xAt(active, n)}%`,
                    transform: `translate(${active < n * 0.2 ? "-10%" : active > n * 0.8 ? "-90%" : "-50%"}, -100%)`,
                  }}
                >
                  <p className="mb-1 text-xs text-ink-2">
                    {longLabel(slots[active], bucket)}
                    {active === n - 1 ? " (so far)" : ""}
                  </p>
                  {lines.map((l) => (
                    <p key={l.key} className="flex items-center gap-2 text-sm">
                      <span className={cn("size-2", toneBg[l.tone])} />
                      <span className="font-semibold tabular-nums">{whole.format(l.values[active])}</span>
                      <span className="text-xs text-ink-2">{l.label}</span>
                    </p>
                  ))}
                </div>
              </>
            ) : null}
            {empty ? <p className="absolute inset-0 grid place-items-center text-sm text-ink-3">Nothing in this range yet</p> : null}
          </div>
          <div aria-hidden className="relative mt-2 h-3 font-mono text-[10px] text-ink-3">
            {slots.map((t, i) =>
              i % every === 0 || i === n - 1 ? (
                <span
                  key={t}
                  className={cn("absolute whitespace-nowrap", i === 0 ? "" : i === n - 1 ? "-translate-x-full" : "-translate-x-1/2")}
                  style={{ left: `${xAt(i, n)}%` }}
                >
                  {i === n - 1 && i % every !== 0 && n > 2 ? "" : axisLabel(t, bucket)}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
      <figcaption className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
        {lines.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5">
            <span className={cn("h-0.5 w-3", toneBg[l.tone])} />
            {l.label}
          </span>
        ))}
        {caption ? <span className="text-ink-3 sm:ml-auto">{caption}</span> : null}
      </figcaption>
      <table className="sr-only">
        <caption>Per {bucket}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {lines.map((l) => (
              <th key={l.key} scope="col">
                {l.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((t, i) => (
            <tr key={t}>
              <th scope="row">{longLabel(t, bucket)}</th>
              {lines.map((l) => (
                <td key={l.key}>{l.values[i]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A small line for a stat tile */
export function Sparkline({ values, tone = "lapis" }: { values: number[]; tone?: Tone }) {
  if (values.length < 2) return null;
  const top = Math.max(1, ...values);
  return (
    <span aria-hidden className="relative block h-9 w-full">
      <Area values={values} top={top} tone={tone} level={25} />
      <Path values={values} top={top} tone={tone} width={1.5} />
    </span>
  );
}

const dithers = ["", "dither-12", "dither-25", "dither-50", "dither-75"];

/** How many of each week's new people came back in the weeks after, darker for more */
export function CohortGrid({ cohorts }: { cohorts: { week: string; size: number; weeks: number[] }[] }) {
  const span = Math.max(1, ...cohorts.map((c) => c.weeks.length));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-xs">
        <thead>
          <tr className="font-mono text-[10px] text-ink-3">
            <th scope="col" className="pb-2 text-left font-normal">
              Signed up
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              People
            </th>
            {Array.from({ length: span }, (_, i) => (
              <th key={i} scope="col" className="pb-2 font-normal">
                {i === 0 ? "Wk 0" : `+${i}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => {
            const [, m, d] = c.week.split("-").map(Number);
            return (
              <tr key={c.week}>
                <th scope="row" className="py-px pr-3 text-left font-normal whitespace-nowrap text-ink-2">
                  {MONTHS[m - 1].slice(0, 3)} {d}
                </th>
                <td className="py-px pr-3 text-right font-mono tabular-nums">{c.size}</td>
                {Array.from({ length: span }, (_, i) => {
                  const back = c.weeks[i];
                  if (back === undefined) return <td key={i} />;
                  const share = c.size ? back / c.size : 0;
                  const level = share === 0 ? 0 : share < 0.15 ? 1 : share < 0.35 ? 2 : share < 0.6 ? 3 : 4;
                  return (
                    <td key={i} className="p-px">
                      <span
                        className={cn("relative grid h-8 place-items-center border border-line", share >= 0.85 && "bg-lapis")}
                        title={`${back} of ${c.size}`}
                      >
                        {level && share < 0.85 ? (
                          <span aria-hidden className={cn("absolute inset-0", dithers[level])} style={{ "--dither": "var(--lapis)" } as React.CSSProperties} />
                        ) : null}
                        {c.size ? (
                          <span className="relative bg-raised px-0.5 font-mono text-[10px] tabular-nums">{Math.round(share * 100)}%</span>
                        ) : (
                          <span className="relative text-ink-3">·</span>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const splitTones: Tone[] = ["lapis", "pyrite", "malachite", "hematite", "ink"];
const splitLevels = ["", "dither-75", "dither-50", "dither-25"];

/** Shares of a whole as one bar, each part in its own colour and dither */
export function Split({ parts, name = (l) => l, empty = "Nothing yet" }: { parts: { label: string; value: number }[]; name?: (label: string) => string; empty?: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="py-3 text-xs text-ink-3">{empty}</p>;
  return (
    <div>
      <div className="flex h-4 gap-px">
        {parts.map((p, i) => {
          const tone = splitTones[i % splitTones.length];
          const level = splitLevels[Math.floor(i / splitTones.length) % splitLevels.length];
          return (
            <span
              key={p.label}
              title={`${name(p.label)}: ${p.value}`}
              className={cn("min-w-1", level || toneBg[tone])}
              style={{ flexGrow: p.value, ...(level ? { "--dither": toneVar[tone] } : {}) } as React.CSSProperties}
            />
          );
        })}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className={cn("size-2", toneBg[splitTones[i % splitTones.length]])} />
            {name(p.label)}
            <span className="font-mono text-ink-3 tabular-nums">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
