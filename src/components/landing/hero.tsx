import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/badge";
import { Dither } from "@/components/ui/dither";
import { ditherAssets } from "@/lib/dither-assets";

const notes = [
  { x: 63, y: 21, side: "right", rock: "Kaibab Fm.", status: "Todo", note: "youngest layer" },
  { x: 41, y: 47, side: "left", rock: "Redwall Ls.", status: "In progress", note: "still settling" },
  { x: 66, y: 79, side: "right", rock: "Vishnu Schist", status: "Done", note: "oldest, bedrock" },
] as const;

const PLATE = { width: ditherAssets["surface-panorama"].width * 2, height: ditherAssets["surface-panorama"].height * 2 };

export function Hero() {
  return (
    <section id="surface" className="relative overflow-hidden bg-page">
      <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 sm:pt-20">
        <div className="grid items-end gap-10 md:grid-cols-[1fr_auto]">
          <div>
            <p className="font-mono text-[11px] tracking-[0.16em] text-ink-3 uppercase">Acta · Latin, “things done”</p>
            <h1 className="mt-5 font-display text-[clamp(3.25rem,8.5vw,6.75rem)] leading-[0.92] tracking-[-0.01em]">
              Work, laid down
              <br />
              in layers.
            </h1>
            <p className="mt-7 max-w-md text-lg leading-relaxed text-ink-2">
              A calm project manager for small teams. Boards, tables, custom fields and a public roadmap, and
              nothing you’ll have to dig through.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="primary" size="lg" asChild>
                <Link href="/demo">
                  Open the demo <Icon name="arrow-right" />
                </Link>
              </Button>
              <Button size="lg" asChild>
                <Link href="/library">Design library</Link>
              </Button>
              <span className="ml-1 hidden items-center gap-1.5 text-sm text-ink-3 sm:flex">
                or press <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </div>
          </div>

          <div className="hidden pb-2 text-right md:block">
            <p className="font-caption text-2xl">Plate I.</p>
            <p className="mt-1 font-caption text-[15px] leading-snug text-ink-2">
              Panorama from Point Sublime,
              <br />
              looking east.
            </p>
          </div>
        </div>
      </div>

      <figure className="relative mt-6" style={{ height: PLATE.height }}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2" style={{ width: PLATE.width, height: PLATE.height }}>
          <Dither name="surface-panorama" tone="lapis" deep="ink" scale={2} label="Grand Canyon from Point Sublime, after W. H. Holmes" />
          <div className="absolute inset-0 hidden lg:block">
            {notes.map((n) => (
              <Annotation key={n.rock} {...n} />
            ))}
          </div>
        </div>
      </figure>

      <div className="mx-auto max-w-6xl px-4 pt-4 pb-16 sm:px-6">
        <p className="max-w-2xl font-caption text-[15px] leading-snug text-ink-2">
          <span className="text-ink">Read it top to bottom.</span> New work settles on top; finished work sinks into
          bedrock and stays there. W. H. Holmes, <span className="not-italic">Atlas of the Grand Cañon</span>, 1882.
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
