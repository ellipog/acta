// The Acta mark: an octahedron drawn the way an old crystallography plate
// would draw it. It is turned 20° about its axis and seen from a little
// above, so one equatorial corner (F) faces us and the opposite one (K)
// hides behind, its edges dotted. The two faces turned away from the light
// are hatched, the lower one more densely.
//
// Shared by <LogoMark /> and scripts/logo.mjs (which writes the favicons),
// so it must stay import-free and use only erasable TypeScript.
// Units: the equator spans x 0–100, the axis y 0–104.

type Point = [number, number];

const T: Point = [50, 0];
const B: Point = [50, 104];
const L: Point = [0, 48.92];
const R: Point = [100, 55.08];
const F: Point = [31.8, 60.46];
const K: Point = [68.2, 43.54];

export type LogoDetail = "plate" | "mark" | "glyph";

/** One layer of the drawing, all in currentColor. */
export type LogoPath = {
  d: string;
  /** Stroke width. */
  width?: number;
  /** Fill opacity; the path is filled instead of stroked. */
  fill?: number;
  /** Gap between dots; the stroke becomes a dotted line. */
  dots?: number;
};

// plate: 64px and up, every line resolves. mark: 24–64px, fewer, heavier
// lines that read as tone. glyph: favicon sizes, hatching becomes flat fills.
const weights = {
  plate: { outline: 3, edge: 1.6, equator: 2.3, hatch: 0.7, upper: 4.2, lower: 2.2, dot: 1.9, gap: 4.6 },
  mark: { outline: 5.5, edge: 3.2, equator: 4.4, hatch: 1.6, upper: 8.5, lower: 5, dot: 3, gap: 8.5 },
  glyph: { outline: 10, edge: 6, equator: 7, hatch: 0, upper: 0, lower: 0, dot: 0, gap: 0 },
};

const n = (v: number) => Math.round(v * 100) / 100;
const pt = ([x, y]: Point) => `${n(x)} ${n(y)}`;
const line = (...points: Point[]) => points.map((p, i) => (i ? "L" : "M") + pt(p)).join("");

function hatch(face: Point[], step: number) {
  const ys = face.map((p) => p[1]);
  const bottom = Math.max(...ys);
  let d = "";
  for (let y = Math.min(...ys) + step; y < bottom - step / 3; y += step) {
    const xs: number[] = [];
    face.forEach(([x1, y1], i) => {
      const [x2, y2] = face[(i + 1) % face.length];
      if (y1 !== y2 && (y - y1) * (y - y2) <= 0) xs.push(x1 + ((x2 - x1) * (y - y1)) / (y2 - y1));
    });
    const a = Math.min(...xs);
    const b = Math.max(...xs);
    if (b - a > 1) d += `M${n(a)} ${n(y)}H${n(b)}`;
  }
  return d;
}

export function logoDetailFor(size: number): LogoDetail {
  return size >= 64 ? "plate" : size >= 24 ? "mark" : "glyph";
}

export function logoViewBox(detail: LogoDetail): [number, number, number, number] {
  const pad = weights[detail].outline / 2;
  return [-pad, -pad, 100 + pad * 2, 104 + pad * 2];
}

export function logoPaths(detail: LogoDetail): LogoPath[] {
  const w = weights[detail];
  const shading: LogoPath[] =
    detail === "glyph"
      ? [
          { d: line(T, F, R) + "Z", fill: 0.4 },
          { d: line(B, F, R) + "Z", fill: 0.85 },
        ]
      : [
          { d: hatch([T, F, R], w.upper), width: w.hatch },
          { d: hatch([B, F, R], w.lower), width: w.hatch },
          { d: line(L, K, R) + line(T, K, B), width: w.dot, dots: w.gap },
        ];
  return [
    ...shading,
    { d: line(T, F, B) + line(L, F), width: w.edge },
    { d: line(F, R), width: w.equator },
    { d: line(T, R, B, L) + "Z", width: w.outline },
  ];
}
