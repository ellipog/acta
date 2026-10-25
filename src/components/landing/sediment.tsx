import { Strata, type Stratum } from "@/components/strata";
import { SectionMark } from "./parts";

const events: (Stratum & { when: string; who: string; what: string })[] = [
  { when: "Today, 09:41", who: "Mara", what: "moved ACT-42 to In review", tone: "lapis", density: 0.5, thickness: 30, base: "depth-4", texture: 0.25 },
  { when: "Today, 08:12", who: "Elliot", what: "completed “Vote button”", tone: "pyrite", density: 0.3, thickness: 24, base: "depth-4", texture: 0.3 },
  { when: "Yesterday", who: "Jon", what: "set ACT-38 to High priority", tone: "ink", density: 0.14, thickness: 38, base: "depth-4", texture: 0.2 },
  { when: "Oct 21", who: "Ines", what: "added the Design label", tone: "malachite", density: 0.55, thickness: 20, base: "depth-4", texture: 0.3 },
  { when: "Oct 18", who: "Elliot", what: "created ACT-42", tone: "lapis", density: 0.78, thickness: 30, base: "depth-4", texture: 0.2 },
  { when: "Oct 9", who: "Mara", what: "invited Jon and Ines", tone: "pyrite", density: 0.62, thickness: 26, base: "depth-4", texture: 0.35 },
  { when: "Oct 2", who: "Elliot", what: "created the board", tone: "ink", density: 0.9, thickness: 44, base: "depth-4", texture: 0.1 },
];

const TOP = 14;
const layers: Stratum[] = [{ tone: "depth-4", density: 1, thickness: TOP }, ...events];

const rows = events.map((e, i) => ({
  ...e,
  mid: TOP + events.slice(0, i).reduce((sum, p) => sum + p.thickness, 0) + e.thickness / 2,
}));

export function SedimentSection() {
  return (
    <section id="sediment" className="bg-depth-4">
      <div className="mx-auto max-w-6xl px-4 pt-24 pb-16 sm:px-6">
        <div className="grid gap-6 md:grid-cols-[1fr_1fr] md:items-end">
          <div>
            <SectionMark n="IV" rock="Shale" base="depth-4" tone="ink" level={12} />
            <h2 className="mt-4 font-display text-4xl sm:text-5xl">Every change, kept.</h2>
          </div>
          <p className="max-w-md text-ink-2 md:justify-self-end">
            The activity log works like sediment. Each change settles on the one before it: who, what and when.
            Nothing erodes, so you can always read back down to where a task began.
          </p>
        </div>

        <div className="mt-12 hidden grid-cols-[6.5rem_1fr_19rem] md:grid">
          <div className="relative">
            {rows.map((r) => (
              <p key={r.when} className="absolute right-4 -translate-y-1/2 font-mono text-[11px] text-ink-3" style={{ top: r.mid }}>
                {r.when}
              </p>
            ))}
          </div>
          <Strata layers={layers} seed={4} roughness={2.5} className="border-x border-line-strong" />
          <div className="relative">
            {rows.map((r) => (
              <div key={r.when} className="absolute left-0 flex -translate-y-1/2 items-center gap-3" style={{ top: r.mid }}>
                <span className="h-px w-5 bg-ink" />
                <p className="text-sm">
                  <span className="font-medium">{r.who}</span> <span className="text-ink-2">{r.what}</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 md:hidden">
          <Strata layers={layers} seed={4} roughness={2.5} className="border-x border-line-strong" />
          <ol className="mt-6 flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.when} className="flex gap-3 text-sm">
                <span className="w-24 shrink-0 font-mono text-[11px] leading-5 text-ink-3">{r.when}</span>
                <span>
                  <span className="font-medium">{r.who}</span> <span className="text-ink-2">{r.what}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
