import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Dither } from "@/components/ui/dither";
import { CreditList, Wordmark } from "@/components/site-chrome";
import { SectionMark } from "./parts";

const TIP = { x: 224, y: 404 };
const CAVE = { width: 420, height: 760 };
const CELL = 2;
const FLOOR = { cols: CAVE.width / CELL, rows: 56 };
const MOUND = { top: 14, half: 13 };
const FALL = CAVE.height - (FLOOR.rows - MOUND.top) * CELL - TIP.y - 6;

const B4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const hash = (x: number, y: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

const floor = (() => {
  const cx = TIP.x / CELL;
  let d = "";
  for (let y = 0; y < FLOOR.rows; y++) {
    for (let x = 0; x < FLOOR.cols; x++) {
      const dx = Math.abs(x + 0.5 - cx);
      let density = 0;
      if (y >= MOUND.top) {
        const t = (y - MOUND.top) / (FLOOR.rows - MOUND.top);
        const lump = (Math.sin(y * 0.9) + Math.sin(y * 0.37 + 2)) * 0.7 * t;
        const half = 1.2 + Math.sqrt(t) * 2 + MOUND.half * t ** 2.4 + lump;
        if (dx < half) density = 0.55 + 0.45 * t - (dx / half) * 0.25;
      }
      const depth = FLOOR.rows - y;
      if (depth <= 5) {
        const spread = Math.max(0, 1 - dx / 95);
        density = Math.max(density, spread * (0.9 - depth * 0.14) + (hash(x, y) - 0.5) * 0.2);
      }
      if ((B4[y % 4][x % 4] + 0.5) / 16 < density) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return d;
})();

function Cave({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className} style={CAVE}>
      <Dither name="stalactite-bedrock" tone="bedrock-muted" scale={2} />
      <span
        className="drip absolute block bg-bedrock-ink"
        style={{ left: TIP.x - 2, top: TIP.y, width: 4, height: 6, ["--fall" as string]: `${FALL}px` }}
      />
      <span
        className="drip-splash absolute block h-[2px] text-bedrock-ink"
        style={{ left: TIP.x - 26, top: TIP.y + FALL + 2, width: 52 }}
      />
      <svg
        viewBox={`0 0 ${FLOOR.cols} ${FLOOR.rows}`}
        width={CAVE.width}
        height={FLOOR.rows * CELL}
        shapeRendering="crispEdges"
        className="absolute bottom-0 left-0 fill-bedrock-muted"
      >
        <path d={floor} />
      </svg>
    </div>
  );
}

const log = [
  ["Hole", "ACTA-1"],
  ["Logged", "25 Oct 2026"],
  ["Recovery", "100%"],
  ["Reached", "Bedrock, end of hole"],
];

export function BedrockSection() {
  return (
    <section id="bedrock" className="relative overflow-hidden bg-bedrock text-bedrock-ink">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <Cave className="pointer-events-none absolute top-0 right-0 hidden md:block lg:right-10" />

        <div className="relative flex max-w-xl flex-col justify-center pt-24 pb-28 md:min-h-[760px] md:pt-28">
          <SectionMark n="VI" rock="Bedrock" base="bedrock-2" tone="bedrock-muted" level={50} className="text-bedrock-muted" />
          <h2 className="mt-5 font-display text-[clamp(2.75rem,6.5vw,5.25rem)] leading-[0.95]">
            Lay the
            <br />
            first stone.
          </h2>
          <p className="mt-7 max-w-md text-lg leading-relaxed text-bedrock-muted">
            A stalactite grows a few millimetres a century, one drop at a time. A board grows the same way: one
            task, then the next. Start yours.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button
              size="lg"
              asChild
              className="border-pyrite bg-pyrite text-bedrock hover:border-bedrock-ink hover:bg-bedrock-ink"
            >
              <Link href="/demo">
                Open the demo <Icon name="arrow-right" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="ghost"
              asChild
              className="border-bedrock-2 text-bedrock-muted hover:bg-bedrock-2 hover:text-bedrock-ink"
            >
              <Link href="/library">Browse the library</Link>
            </Button>
          </div>

          <dl className="mt-14 grid max-w-xs grid-cols-[5.5rem_1fr] gap-y-1 border-t border-bedrock-2 pt-4 font-mono text-[11px]">
            {log.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-bedrock-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <footer className="relative border-t border-bedrock-2">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1fr_2fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-xs text-sm text-bedrock-muted">
              Acta, Latin for “things done.” A project manager for small teams, built in layers.
            </p>
          </div>
          <div id="credits">
            <p className="font-mono text-[11px] tracking-[0.14em] text-bedrock-muted uppercase">Image credits</p>
            <CreditList
              className="mt-3 text-bedrock-muted"
              linkClassName="decoration-bedrock-2 hover:text-bedrock-ink hover:decoration-bedrock-muted"
            />
          </div>
          <div>
            <p className="font-mono text-[11px] tracking-[0.14em] text-bedrock-muted uppercase">Colophon</p>
            <p className="mt-3 font-caption text-[15px] leading-snug text-bedrock-muted">
              Set in Marcellus, Geist and EB Garamond. Every image is public domain or CC0, reduced to one bit with
              a 4×4 Bayer matrix and printed in the page’s own inks.
            </p>
          </div>
        </div>
      </footer>
    </section>
  );
}
