import { cn } from "@/lib/utils";
import { pixelBox } from "@/lib/pixel";

type GlyphProps = { className?: string };

// Each glyph can carry a line drawing in the same box, shown instead when Appearance asks for line icons (see
// globals.css). Line drawings use the glyph's own cells as units
function Glyph({
  w,
  h,
  d,
  line,
  className,
  scale = 2,
}: {
  w: number;
  h: number;
  d: string;
  line?: string;
  className?: string;
  scale?: number;
}) {
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w * scale}
      height={h * scale}
      shapeRendering="crispEdges"
      aria-hidden
      className={cn("pixel shrink-0 fill-current", className)}
      style={pixelBox(w, h, scale)}
    >
      <path d={d} className={line ? "icon-px" : undefined} />
      {line ? <path d={line} className="icon-line" style={{ strokeWidth: Math.min(1.5 / scale, 1.2) }} /> : null}
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
      line="M1 0.8L3.5 3.2L6 0.8"
    />
  );
}

export function PixelCheck({ className }: GlyphProps) {
  return (
    <Glyph
      w={7}
      h={5}
      className={className}
      d="M6 0h1v1H6zM5 1h1v1H5zM0 2h1v1H0zM4 2h1v1H4zM1 3h1v1H1zM3 3h1v1H3zM2 4h1v1H2z"
      line="M0.6 2.5L2.5 4.4L6.4 0.6"
    />
  );
}

/** The tick in a checkbox. Smaller than PixelCheck, so it sits inside the box with room around it */
export function PixelTick({ className }: GlyphProps) {
  return (
    <Glyph
      w={5}
      h={4}
      className={cn("pixel-fit", className)}
      d="M4 0h1v1H4zM3 1h1v1H3zM0 2h1v1H0zM2 2h1v1H2zM1 3h1v1H1z"
      line="M0.5 2.2L1.6 3.4L4.5 0.6"
    />
  );
}

/** A checkbox that's partly checked */
export function PixelDash({ className }: GlyphProps) {
  return <Glyph w={5} h={1} className={cn("pixel-fit", className)} d="M0 0h5v1H0z" />;
}

export function PixelArrow({ className, dir = "right" }: GlyphProps & { dir?: "left" | "right" }) {
  return (
    <Glyph
      w={4}
      h={7}
      className={cn(dir === "left" && "-scale-x-100", className)}
      d="M0 0h1v1H0zM1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3zM2 4h1v1H2zM1 5h1v1H1zM0 6h1v1H0z"
      line="M0.7 0.7L3.2 3.5L0.7 6.3"
    />
  );
}

export function PixelPlus({ className }: GlyphProps) {
  return <Glyph w={5} h={5} className={className} d="M2 0h1v5H2zM0 2h5v1H0z" line="M2.5 0.5v4M0.5 2.5h4" />;
}

export function PixelMinus({ className }: GlyphProps) {
  return <Glyph w={5} h={5} className={className} d="M0 2h5v1H0z" line="M0.5 2.5h4" />;
}
