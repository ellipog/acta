"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ignoreKey } from "@/components/analytics";
import { Switch } from "@/components/ui/controls";
import { DitherFill } from "@/components/ui/dither";
import { Eyebrow } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { MONTHS } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { ranges, type RangeId, type Report, type Row, type Slot, type Totals } from "./report";

const whole = new Intl.NumberFormat("en");
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const count = (n: number) => (n >= 10_000 ? compact.format(n) : whole.format(n));
const percent = (n: number) => `${Math.round(n * 100)}%`;
const duration = (seconds: number) => {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

type MetricId = "visitors" | "pageviews" | "visits" | "perVisit" | "bounce" | "duration";

const metrics: {
  id: MetricId;
  label: string;
  of: (t: Totals) => number;
  format: (n: number) => string;
  upIsGood: boolean;
  points?: boolean;
}[] = [
  { id: "visitors", label: "Unique visitors", of: (t) => t.visitors, format: count, upIsGood: true },
  { id: "pageviews", label: "Pageviews", of: (t) => t.pageviews, format: count, upIsGood: true },
  { id: "visits", label: "Visits", of: (t) => t.visits, format: count, upIsGood: true },
  {
    id: "perVisit",
    label: "Views per visit",
    of: (t) => (t.visits ? t.pageviews / t.visits : 0),
    format: (n) => n.toFixed(1),
    upIsGood: true,
  },
  { id: "bounce", label: "Bounce rate", of: (t) => t.bounce, format: percent, upIsGood: false, points: true },
  { id: "duration", label: "Visit duration", of: (t) => t.duration, format: duration, upIsGood: true },
];

const regions = new Intl.DisplayNames(["en"], { type: "region" });
const country = (code: string) => {
  try {
    return regions.of(code) ?? code;
  } catch {
    return code;
  }
};

function parts(t: string) {
  const [date, time] = t.split("T");
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d, time, month: MONTHS[m - 1], short: MONTHS[m - 1].slice(0, 3) };
}

function axisLabel(t: string, bucket: string) {
  const p = parts(t);
  if (bucket === "hour") return p.time;
  if (bucket === "month") return p.m === 1 ? `${p.short} ’${String(p.y).slice(2)}` : p.short;
  return `${p.short} ${p.d}`;
}

function longLabel(t: string, bucket: string) {
  const p = parts(t);
  const weekday = new Date(Date.UTC(p.y, p.m - 1, p.d)).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  if (bucket === "hour") return `${weekday} ${p.short} ${p.d}, ${p.time}`;
  if (bucket === "day") return `${weekday} ${p.short} ${p.d}`;
  if (bucket === "week") return `Week of ${p.short} ${p.d}`;
  return `${p.month} ${p.y}`;
}

function niceTop(max: number) {
  for (let k = 1; ; k *= 10) for (const m of [2, 4, 6, 8, 10]) if (m * k >= max) return m * k;
}

function useIgnored() {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("storage", notify);
      return () => window.removeEventListener("storage", notify);
    },
    () => {
      try {
        return localStorage.getItem(ignoreKey) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
}

function Delta({ now, before, upIsGood, points }: { now: number; before: number; upIsGood: boolean; points?: boolean }) {
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

function Chart({ series, metric, bucket }: { series: Slot[]; metric: "visitors" | "pageviews"; bucket: string }) {
  const [active, setActive] = useState<number | null>(null);
  const values = series.map((s) => s[metric]);
  const top = niceTop(Math.max(0, ...values));
  const every = Math.max(1, Math.ceil(series.length / 8));
  const label = metric === "visitors" ? "visitors" : "pageviews";
  const empty = values.every((v) => v === 0);
  const shown = active ?? null;

  return (
    <figure className="border border-line bg-raised p-4 sm:p-5">
      <div className="grid grid-cols-[2.25rem_1fr] gap-2">
        <div className="relative h-56 font-mono text-[10px] text-ink-3 tabular-nums">
          {[top, top / 2, 0].map((v, i) => (
            <span key={i} className="absolute right-0 -translate-y-1/2" style={{ top: `${i * 50}%` }}>
              {count(v)}
            </span>
          ))}
        </div>
        <div>
          <div
            tabIndex={0}
            role="group"
            aria-label={`${label} per ${bucket}. Use the arrow keys to read each ${bucket}.`}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
              e.preventDefault();
              const last = series.length - 1;
              setActive((i) => {
                if (e.key === "Home") return 0;
                if (e.key === "End") return last;
                const from = i ?? last;
                return Math.min(last, Math.max(0, from + (e.key === "ArrowLeft" ? -1 : 1)));
              });
            }}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            className="relative h-56 outline-none focus-visible:ring-2 focus-visible:ring-lapis focus-visible:ring-offset-4 focus-visible:ring-offset-raised"
          >
            {[0, 50, 100].map((y) => (
              <span key={y} aria-hidden className="absolute inset-x-0 h-px bg-line" style={{ top: `${y}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {series.map((s, i) => {
                const value = s[metric];
                const height = `${(value / top) * 100}%`;
                const current = i === series.length - 1;
                return (
                  <div
                    key={s.t}
                    onPointerEnter={() => setActive(i)}
                    className="relative flex h-full min-w-0 flex-1 items-end justify-center"
                  >
                    {value > 0 ? (
                      <span className="relative block w-full max-w-6" style={{ height }}>
                        {current ? (
                          <DitherFill level={75} tone="lapis" className="absolute inset-0" />
                        ) : (
                          <span
                            className={cn("absolute inset-0 transition-colors", shown === i ? "bg-lapis-hover" : "bg-lapis")}
                          />
                        )}
                      </span>
                    ) : null}
                    {shown === i ? <span aria-hidden className="absolute inset-y-0 w-px bg-ink/20" /> : null}
                  </div>
                );
              })}
            </div>
            {empty ? (
              <p className="absolute inset-0 grid place-items-center text-sm text-ink-3">No visits in this range yet</p>
            ) : null}
            {shown !== null ? (
              <div
                role="status"
                className="pointer-events-none absolute -top-2 z-10 -translate-y-full border border-ink bg-raised px-3 py-2 whitespace-nowrap shadow-[3px_3px_0_var(--line-strong)]"
                style={{
                  left: `${((shown + 0.5) / series.length) * 100}%`,
                  transform: `translate(${shown < series.length * 0.2 ? "-10%" : shown > series.length * 0.8 ? "-90%" : "-50%"}, -100%)`,
                }}
              >
                <p className="text-lg font-semibold">{whole.format(series[shown][metric])}</p>
                <p className="text-xs text-ink-2">
                  {label} · {longLabel(series[shown].t, bucket)}
                  {shown === series.length - 1 ? " (so far)" : ""}
                </p>
              </div>
            ) : null}
          </div>
          <div aria-hidden className="mt-2 flex gap-[2px] font-mono text-[10px] text-ink-3">
            {series.map((s, i) => (
              <span key={s.t} className="relative min-w-0 flex-1">
                {i % every === 0 ? (
                  <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{axisLabel(s.t, bucket)}</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="mt-7 flex items-center gap-2 text-xs text-ink-3">
        <span className="relative size-2.5 border border-lapis">
          <DitherFill level={75} tone="lapis" className="absolute inset-0" />
        </span>
        The last {bucket} is still filling in.
      </figcaption>
      <table className="sr-only">
        <caption>
          {label} per {bucket}
        </caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Visitors</th>
            <th scope="col">Pageviews</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.t}>
              <th scope="row">{longLabel(s.t, bucket)}</th>
              <td>{s.visitors}</td>
              <td>{s.pageviews}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

type View = { id: string; tab: string; column: string; rows: Row[]; name?: (label: string) => React.ReactNode };

function Breakdown({ title, views }: { title: string; views: View[] }) {
  return (
    <section className="flex min-w-0 flex-col border border-line bg-raised">
      <Tabs defaultValue={views[0].id} className="flex flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line pl-4">
          <h2 className="py-2.5 text-sm font-medium">{title}</h2>
          {views.length > 1 ? (
            <TabsList className="ml-auto border-b-0">
              {views.map((v) => (
                <TabsTrigger key={v.id} value={v.id} className="h-10 px-2.5 text-xs">
                  {v.tab}
                </TabsTrigger>
              ))}
            </TabsList>
          ) : null}
        </div>
        {views.map((v) => {
          const max = Math.max(1, ...v.rows.map((r) => r.value));
          return (
            <TabsContent key={v.id} value={v.id} className="flex-1 outline-none">
              <div className="flex justify-between px-4 pt-3 pb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                <span>{v.tab === title ? "Name" : v.tab}</span>
                <span>{v.column}</span>
              </div>
              {v.rows.length ? (
                <ol className="px-2 pb-3">
                  {v.rows.map((r) => (
                    <li key={r.label} className="relative flex h-8 items-center gap-3 px-2 text-sm">
                      <span
                        aria-hidden
                        className="absolute inset-y-0.5 left-0 bg-lapis-soft"
                        style={{ width: `${(r.value / max) * 100}%` }}
                      />
                      <span className="relative min-w-0 flex-1 truncate">{v.name ? v.name(r.label) : r.label}</span>
                      <span className="relative font-mono text-xs text-ink-2 tabular-nums">{count(r.value)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="px-4 pt-6 pb-8 text-center text-xs text-ink-3">Nothing yet</p>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </section>
  );
}

export function AnalyticsView({ report, range, dev }: { report: Report; range: RangeId; dev: boolean }) {
  const [metric, setMetric] = useState<"visitors" | "pageviews">("visitors");
  const ignored = useIgnored();
  const bucket = ranges[range].bucket;
  const href = (next: { range?: RangeId; dev?: boolean }) => {
    const r = next.range ?? range;
    const d = next.dev ?? dev;
    const q = new URLSearchParams();
    if (r !== "7d") q.set("range", r);
    if (d) q.set("dev", "1");
    const s = q.toString();
    return s ? `/admin?${s}` : "/admin";
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="mr-auto">
          <Eyebrow>Admin</Eyebrow>
          <h1 className="mt-2 font-display text-4xl">Analytics</h1>
        </div>
        <p className="flex items-center gap-2 text-sm text-ink-2" aria-live="polite">
          <span className={cn("size-2", report.live ? "animate-pulse bg-malachite" : "bg-line-strong")} />
          {report.live === 1 ? "1 person here now" : `${report.live} people here now`}
        </p>
      </header>

      <nav aria-label="Time range" className="flex flex-wrap items-center gap-3">
        <div className="flex border border-line-strong bg-raised">
          {(Object.keys(ranges) as RangeId[]).map((id) => (
            <Link
              key={id}
              href={href({ range: id })}
              scroll={false}
              aria-current={id === range ? "page" : undefined}
              className={cn(
                "h-8 border-r border-line-strong px-3 font-mono text-xs leading-8 last:border-r-0",
                id === range ? "bg-ink text-page" : "text-ink-2 hover:bg-sunken hover:text-ink",
              )}
            >
              {id}
            </Link>
          ))}
        </div>
        <span className="text-xs text-ink-3">Last {ranges[range].label}, compared with the {ranges[range].label} before</span>
        <Link
          href={href({ dev: !dev })}
          scroll={false}
          className={cn(
            "ml-auto flex h-8 items-center gap-2 border px-2.5 text-xs",
            dev ? "border-pyrite bg-pyrite-soft text-pyrite-ink" : "border-line text-ink-3 hover:text-ink",
          )}
        >
          <Icon name={dev ? "eye" : "eye-off"} size="sm" />
          {dev ? "Including localhost" : "Localhost hidden"}
        </Link>
      </nav>

      <div className="grid grid-cols-2 border-t border-l border-line sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((m) => {
          const chartable = m.id === "visitors" || m.id === "pageviews";
          const selected = chartable && metric === m.id;
          const body = (
            <>
              <span className="text-xs text-ink-2">{m.label}</span>
              <span className="mt-1.5 block text-3xl font-semibold tracking-tight">{m.format(m.of(report.totals))}</span>
              <span className="mt-1 block">
                <Delta now={m.of(report.totals)} before={m.of(report.previous)} upIsGood={m.upIsGood} points={m.points} />
              </span>
            </>
          );
          const tile = cn(
            "relative block border-r border-b border-line bg-raised px-4 py-4 text-left",
            selected && "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-lapis",
          );
          return chartable ? (
            <button
              key={m.id}
              aria-pressed={selected}
              onClick={() => setMetric(m.id as "visitors" | "pageviews")}
              className={cn(tile, "outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-lapis focus-visible:ring-inset")}
            >
              {body}
            </button>
          ) : (
            <div key={m.id} className={tile}>
              {body}
            </div>
          );
        })}
      </div>

      <Chart series={report.series} metric={metric} bucket={bucket} />

      <div className="grid gap-4 md:grid-cols-2">
        <Breakdown
          title="Pages"
          views={[
            { id: "top", tab: "Top pages", column: "Visitors", rows: report.pages },
            { id: "entry", tab: "Entry pages", column: "Visits", rows: report.entries },
            { id: "hosts", tab: "Sites", column: "Visitors", rows: report.hosts },
          ]}
        />
        <Breakdown
          title="Sources"
          views={[
            { id: "referrers", tab: "Referrers", column: "Visits", rows: report.referrers },
            { id: "campaigns", tab: "Campaigns", column: "Visits", rows: report.campaigns },
          ]}
        />
        <Breakdown
          title="Countries"
          views={[{ id: "countries", tab: "Country", column: "Visitors", rows: report.countries, name: country }]}
        />
        <Breakdown
          title="Devices"
          views={[
            { id: "devices", tab: "Device", column: "Visitors", rows: report.devices, name: (l) => l.charAt(0).toUpperCase() + l.slice(1) },
            { id: "browsers", tab: "Browser", column: "Visitors", rows: report.browsers },
            { id: "systems", tab: "System", column: "Visitors", rows: report.systems },
          ]}
        />
        <div className="md:col-span-2">
          <Breakdown title="Events" views={[{ id: "events", tab: "Event", column: "Count", rows: report.events }]} />
        </div>
      </div>

      <footer className="flex flex-wrap items-start justify-between gap-4 border-t border-line pt-5 text-xs text-ink-3">
        <p className="max-w-xl">
          No cookies. Visitors are counted with a salted hash of IP and browser that changes every day, and IPs are never
          stored. Events older than 13 months are deleted.
        </p>
        <label className="flex items-center gap-2.5 text-ink-2">
          <Switch
            checked={ignored}
            onCheckedChange={(on) => {
              try {
                if (on) localStorage.setItem(ignoreKey, "1");
                else localStorage.removeItem(ignoreKey);
                window.dispatchEvent(new StorageEvent("storage", { key: ignoreKey }));
              } catch {}
            }}
            aria-label="Ignore my visits in this browser"
          />
          Ignore my visits in this browser
        </label>
      </footer>
    </div>
  );
}
