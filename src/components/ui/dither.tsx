import { ditherAssets, type DitherName } from "@/lib/dither-assets";
import { cn } from "@/lib/utils";

const tones = {
  ink: "var(--ink)",
  muted: "var(--ink-3)",
  line: "var(--line-strong)",
  lapis: "var(--lapis)",
  pyrite: "var(--pyrite)",
  malachite: "var(--malachite)",
  hematite: "var(--hematite)",
  bedrock: "var(--bedrock)",
  "bedrock-ink": "var(--bedrock-ink)",
  "bedrock-muted": "var(--bedrock-muted)",
} as const;

export type DitherTone = keyof typeof tones;

// Never resample a dither: shrinking aliases the pattern, so scale stays whole
export function Dither({
  name,
  tone = "ink",
  deep,
  scale = 1,
  fill,
  smooth,
  position = "center",
  className,
  style,
  label,
}: {
  name: DitherName;
  tone?: DitherTone;
  deep?: DitherTone;
  scale?: number;
  fill?: boolean;
  smooth?: boolean;
  position?: string;
  className?: string;
  style?: React.CSSProperties;
  label?: string;
}) {
  const asset = ditherAssets[name];
  const contain = fill && asset.kind === "crystal";
  const size = contain ? "contain" : `${asset.width * scale}px ${asset.height * scale}px`;
  const layer = (file: string, color: DitherTone): Record<string, string | number> => ({
    "--dither": tones[color],
    maskImage: `url(/dither/${file}.png)`,
    WebkitMaskImage: `url(/dither/${file}.png)`,
    maskSize: size,
    WebkitMaskSize: size,
    maskPosition: position,
    WebkitMaskPosition: position,
    ...(contain || smooth ? { imageRendering: "auto" } : {}),
  });
  const box = fill ? {} : { width: asset.width * scale, height: asset.height * scale };
  const a11y = {
    role: label ? "img" : undefined,
    "aria-label": label,
    "aria-hidden": label ? undefined : true,
  } as const;

  if (deep && asset.deep) {
    return (
      <div {...a11y} className={cn("relative", fill && "absolute inset-0", className)} style={{ ...box, ...style }}>
        <div className="dither-image absolute inset-0" style={layer(name, tone) as React.CSSProperties} />
        <div className="dither-image absolute inset-0" style={layer(`${name}.deep`, deep) as React.CSSProperties} />
      </div>
    );
  }

  return (
    <div
      {...a11y}
      className={cn("dither-image", fill && "absolute inset-0", className)}
      style={{ ...layer(name, tone), ...box, ...style } as React.CSSProperties}
    />
  );
}

export function DitherFill({
  level = 50,
  tone = "ink",
  className,
  style,
}: {
  level?: 12 | 25 | 50 | 75;
  tone?: DitherTone;
  className?: string;
  style?: React.CSSProperties;
}) {
  const cls = { 12: "dither-12", 25: "dither-25", 50: "dither-50", 75: "dither-75" }[level];
  return (
    <span
      aria-hidden
      className={cn("block", cls, className)}
      style={{ "--dither": tones[tone], ...style } as React.CSSProperties}
    />
  );
}

export function DitherShadow({
  offset = 6,
  tone = "ink",
  level = 50,
  className,
  children,
}: {
  offset?: number;
  tone?: DitherTone;
  level?: 12 | 25 | 50 | 75;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative isolate", className)}>
      <DitherFill
        level={level}
        tone={tone}
        className="absolute inset-0 -z-10"
        style={{ transform: `translate(${offset}px, ${offset}px)` }}
      />
      {children}
    </div>
  );
}
