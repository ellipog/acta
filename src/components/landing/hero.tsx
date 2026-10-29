import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Dither } from "@/components/ui/dither";
import { ditherAssets } from "@/lib/dither-assets";
import { authReady } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";

const notes = [
  { x: 63, y: 21, side: "right", rock: "Kaibab Fm.", status: "Todo", note: "youngest layer" },
  { x: 41, y: 47, side: "left", rock: "Redwall Ls.", status: "In progress", note: "still settling" },
  { x: 66, y: 79, side: "right", rock: "Vishnu Schist", status: "Done", note: "oldest, bedrock" },
] as const;

const PLATE = { width: ditherAssets["surface-panorama"].width * 2, height: ditherAssets["surface-panorama"].height * 2 };

// The name is set like a core sample: loose sediment at the top, settling into solid bedrock at the bottom
const strata: { to: number; tone: string; level?: 25 | 50 | 75 }[] = [
  { to: 24, tone: "var(--pyrite)", level: 50 },
  { to: 46, tone: "var(--lapis)", level: 50 },
  { to: 68, tone: "var(--lapis)", level: 75 },
  { to: 100, tone: "var(--ink)" },
];

function Strata({ children }: { children: string }) {
  return (
    <span className="relative block">
      <span className="invisible">{children}</span>
      {strata.map((band, i) => {
        const from = i ? strata[i - 1].to : 0;
        return (
          <span
            key={band.to}
            aria-hidden
            className={cn("absolute inset-0", band.level && `dither-${band.level}`)}
            style={{
              color: band.tone,
              backgroundColor: "transparent",
              clipPath: `inset(calc(${from}% + ${i ? 2 : 0}px) 0 ${100 - band.to}% 0)`,
            }}
          >
            {children}
          </span>
        );
      })}
    </span>
  );
}

export function Hero() {
  return (
    <section id="surface" className="relative overflow-hidden bg-page">
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
        <div className="flex items-baseline justify-between gap-6 border-b border-line pb-3 font-mono text-[11px] tracking-[0.16em] text-ink-3 uppercase">
          <span>Latin, “things done”</span>
          <span className="hidden sm:inline">A project manager, in layers</span>
        </div>
        {/* The wordmark is the picture, and the line under it says in words what Acta is */}
        <h1 className="mt-6">
          <span className="block font-display text-[clamp(5rem,27.6vw,24.6rem)] leading-[0.74] tracking-[0.06em]">
            <Strata>ACTA</Strata>
          </span>
          <span className="mt-8 block border-t border-line pt-6 font-display text-3xl leading-tight sm:text-4xl">
            Project management for teams and their AI agents
          </span>
        </h1>
        <div className="mt-5 grid items-end gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
          <p className="max-w-lg text-lg leading-relaxed text-ink-2">
            A calm kanban board, table and timeline, with a public roadmap people can vote on. Claude Code, Cursor
            and other agents work on the same tasks over MCP.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" asChild>
              <Link href="/demo">
                Open the demo <Icon name="arrow-right" />
              </Link>
            </Button>
            {authReady ? (
              <Button size="lg" asChild>
                <Link href="/new">Start a board</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <figure className="relative mt-10" style={{ height: PLATE.height }}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2" style={{ width: PLATE.width, height: PLATE.height }}>
          <Dither name="surface-panorama" tone="lapis" deep="ink" scale={2} label="The Grand Canyon from Point Sublime" />
          <div className="absolute inset-0 hidden lg:block">
            {notes.map((n) => (
              <Annotation key={n.rock} {...n} />
            ))}
          </div>
        </div>
      </figure>

      <div className="mx-auto max-w-6xl px-4 pt-4 pb-16 sm:px-6">
        <p className="max-w-2xl font-caption text-[15px] leading-snug text-ink-2">
          <span className="text-ink">Plate I. Point Sublime, looking east.</span> Read it top to bottom: new work
          settles on top, finished work sinks into bedrock and stays there.
        </p>
      </div>
    </section>
  );
}

function Annotation({
  x,
  y,
  side,
  rock,
  status,
  note,
}: {
  x: number;
  y: number;
  side: "left" | "right";
  rock: string;
  status: string;
  note: string;
}) {
  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>
      <span className="absolute -top-[5px] -left-[5px] size-[10px] border-2 border-ink bg-page" />
      <span className={`absolute top-0 h-px w-24 bg-ink ${side === "right" ? "left-[5px]" : "right-[5px]"}`} />
      <div
        className={`absolute top-0 -translate-y-1/2 border border-ink bg-page px-2.5 py-1.5 whitespace-nowrap ${
          side === "right" ? "left-[101px]" : "right-[101px] text-right"
        }`}
      >
        <p className="font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">{rock}</p>
        <p className="font-caption text-[15px] leading-tight">
          {status} <span className="text-ink-3">— {note}</span>
        </p>
      </div>
    </div>
  );
}
