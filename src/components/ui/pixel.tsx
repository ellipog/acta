import { cn } from "@/lib/utils";

type GlyphProps = { className?: string };

function Glyph({ w, h, d, className, scale = 2 }: { w: number; h: number; d: string; className?: string; scale?: number }) {
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w * scale}
      height={h * scale}
      shapeRendering="crispEdges"
      aria-hidden
      className={cn("pixel shrink-0 fill-current", className)}
    >
      <path d={d} />
    </svg>
  );
}

export function PixelCaret({ className, open }: GlyphProps & { open?: boolean }) {
  return (
    <Glyph
      w={7}
      h={4}
      scale={1}
      className={cn("transition-transform", open && "rotate-180", className)}
      d="M0 0h7v1H0zM1 1h5v1H1zM2 2h3v1H2zM3 3h1v1H3z"
    />
  );
}

export function PixelCheck({ className }: GlyphProps) {
  return <Glyph w={7} h={5} className={className} d="M6 0h1v1H6zM5 1h1v1H5zM0 2h1v1H0zM4 2h1v1H4zM1 3h1v1H1zM3 3h1v1H3zM2 4h1v1H2z" />;
}

export function PixelArrow({ className, dir = "right" }: GlyphProps & { dir?: "left" | "right" }) {
  return (
    <Glyph
      w={4}
      h={7}
      className={cn(dir === "left" && "-scale-x-100", className)}
      d="M0 0h1v1H0zM1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3zM2 4h1v1H2zM1 5h1v1H1zM0 6h1v1H0z"
    />
  );
}

export function PixelPlus({ className }: GlyphProps) {
  return <Glyph w={5} h={5} className={className} d="M2 0h1v5H2zM0 2h5v1H0z" />;
}

export function PixelMinus({ className }: GlyphProps) {
  return <Glyph w={5} h={5} className={className} d="M0 2h5v1H0z" />;
}
