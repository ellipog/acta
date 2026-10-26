import { logoDetailFor, logoPaths, logoViewBox, type LogoDetail } from "@/lib/logo";
import { cn } from "@/lib/utils";

/** The octahedron, drawn in currentColor. `size` is its height in pixels. */
export function LogoMark({ size = 28, detail = logoDetailFor(size), className }: { size?: number; detail?: LogoDetail; className?: string }) {
  const [x, y, w, h] = logoViewBox(detail);
  return (
    <svg
      aria-hidden
      viewBox={`${x} ${y} ${w} ${h}`}
      width={(size * w) / h}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
    >
      {logoPaths(detail).map(({ d, width, fill, dots }, i) =>
        fill != null ? (
          <path key={i} d={d} fill="currentColor" fillOpacity={fill} stroke="none" />
        ) : (
          <path key={i} d={d} strokeWidth={width} strokeDasharray={dots ? `0 ${dots}` : undefined} />
        ),
      )}
    </svg>
  );
}
