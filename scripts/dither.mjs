import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { recipes, playgroundSources } from "../assets/dither.config.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(root, "assets/source");
const outDir = path.join(root, "public/dither");
const manifestFile = path.join(root, "src/lib/dither-manifest.json");

export function bayer(n) {
  if (n === 1) return [[0]];
  const half = bayer(n / 2);
  const size = half.length;
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = half[y][x] * 4;
      m[y][x] = v;
      m[y][x + size] = v + 2;
      m[y + size][x] = v + 3;
      m[y + size][x + size] = v + 1;
    }
  }
  return m;
}

const B4 = bayer(4);

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x, y) {
  const octave = (s) => {
    const gx = x / s, gy = y / s;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const tx = gx - x0, ty = gy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
  return octave(14) * 0.65 + octave(5) * 0.35;
}

function edgeFactor(x, y, width, height, fade) {
  let f = 1;
  if (fade.top) f = Math.min(f, y / fade.top);
  if (fade.bottom) f = Math.min(f, (height - 1 - y) / fade.bottom);
  if (fade.left) f = Math.min(f, x / fade.left);
  if (fade.right) f = Math.min(f, (width - 1 - x) / fade.right);
  f = Math.max(0, f);
  if (f >= 1) return 1;
  return Math.min(1, Math.max(0, f + (noise(x, y) - 0.5) * 2.4 * f * (1 - f) * 2));
}

async function writeMask(name, mask, width, height) {
  const out = Buffer.alloc(width * height * 4);
  let ink = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      out[i * 4 + 3] = 255;
      ink++;
    }
  }
  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ palette: true, colours: 2, compressionLevel: 9 })
    .toFile(path.join(outDir, `${name}.png`));
  return Math.round((ink / mask.length) * 100);
}

async function build(recipe) {
  const {
    mode = "dither",
    matrix = 4,
    levels = [0, 255],
    gamma = 1,
    invert = false,
    normalize = false,
    fade,
    deep,
    bands = 10,
    blur,
  } = recipe;

  let img = sharp(path.join(sourceDir, recipe.source));
  if (recipe.crop) img = img.extract(recipe.crop);
  img = img.resize({ width: recipe.width, kernel: "lanczos3" }).grayscale();
  if (normalize) img = img.normalise({ lower: 1, upper: 99 });
  if (blur) img = img.blur(blur);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const [lo, hi] = levels;
  const tone = new Float32Array(width * height);
  for (let i = 0; i < tone.length; i++) {
    let v = Math.min(1, Math.max(0, (data[i] - lo) / (hi - lo)));
    v = Math.pow(v, 1 / gamma);
    tone[i] = invert ? 1 - v : v;
  }

  const m = matrix ? bayer(matrix) : [[0]];
  const n = m.length;
  const mask = new Uint8Array(width * height);
  const deepMask = deep ? new Uint8Array(width * height) : null;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let on;
      if (mode === "contour") {
        const q = Math.floor(tone[i] * bands);
        const right = x + 1 < width ? Math.floor(tone[i + 1] * bands) : q;
        const below = y + 1 < height ? Math.floor(tone[i + width] * bands) : q;
        on = q !== right || q !== below;
      } else {
        const threshold = (m[y % n][x % n] + 0.5) / (n * n);
        on = tone[i] < threshold;
        if (deepMask && tone[i] < threshold * deep) deepMask[i] = 1;
      }
      if (on && fade) {
        const f = edgeFactor(x, y, width, height, fade);
        if (f < 1 && f <= (B4[(y + 1) % 4][(x + 2) % 4] + 0.5) / 16) on = false;
      }
      if (on) mask[i] = 1;
      if (deepMask && !on) deepMask[i] = 0;
    }
  }

  const coverage = await writeMask(recipe.name, mask, width, height);
  let note = `${coverage}% ink`;
  if (deepMask) note += `, ${await writeMask(`${recipe.name}.deep`, deepMask, width, height)}% deep`;
  console.log(`  ${recipe.name}.png  ${width}×${height}  ${note}`);
  return [recipe.name, { width, height, deep: Boolean(deepMask) }];
}

async function main() {
  const filter = process.argv[2];
  await mkdir(path.join(outDir, "src"), { recursive: true });

  const selected = recipes.filter((r) => !filter || r.name.includes(filter));
  console.log(`Dithering ${selected.length} image(s)`);
  const built = [];
  for (const recipe of selected) built.push(await build(recipe));

  let manifest = {};
  if (filter) {
    try {
      manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    } catch {}
  }
  Object.assign(manifest, Object.fromEntries(built));
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(manifestFile, JSON.stringify(sorted, null, 2) + "\n");

  if (!filter) {
    for (const file of playgroundSources) {
      await sharp(path.join(sourceDir, file))
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toFile(path.join(outDir, "src", path.basename(file)));
    }
    console.log(`Copied ${playgroundSources.length} playground source(s)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
