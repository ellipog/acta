// Writes the app icons from the mark in src/lib/logo.ts. Run `npm run logo`
// after changing the drawing.
//
//   src/app/icon.svg        tab icon, ink on light tabs and paper on dark ones
//   src/app/favicon.ico     16/32/48 px fallback on a paper tile
//   src/app/apple-icon.png  180 px home screen icon, full bleed paper
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { logoDetailFor, logoPaths, logoViewBox } from "../src/lib/logo.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appDir = path.join(root, "src/app");

const paper = "#f3f0e8";
const ink = "#1d2230";
const inkDark = "#e9e5db";

function markSvg(detail, attrs = "", head = "") {
  const body = logoPaths(detail)
    .map(({ d, width, fill, dots }) =>
      fill != null
        ? `<path d="${d}" fill="currentColor" fill-opacity="${fill}" stroke="none"/>`
        : `<path d="${d}" stroke-width="${width}"${dots ? ` stroke-dasharray="0 ${dots}"` : ""}/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logoViewBox(detail).join(" ")}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"${attrs}>${head}${body}</svg>`;
}

// The mark centred on a square of paper, `scale` being its height as a share
// of the square.
function tileSvg(size, { scale, radius = 0, detail = logoDetailFor(size * scale) }) {
  const [, , vw, vh] = logoViewBox(detail);
  const h = size * scale;
  const w = (h * vw) / vh;
  const mark = markSvg(detail, ` x="${(size - w) / 2}" y="${(size - h) / 2}" width="${w}" height="${h}" color="${ink}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${paper}"/>${mark}</svg>`;
}

const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

// An .ico is a directory of images; modern ones may hold plain PNGs.
function ico(images) {
  const head = Buffer.alloc(6 + images.length * 16);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const at = 6 + i * 16;
    head[at] = head[at + 1] = size;
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(data.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((image) => image.data)]);
}

const icon = markSvg(
  "glyph",
  ` color="${ink}"`,
  `<style>@media (prefers-color-scheme: dark) { svg { color: ${inkDark} } }</style>`,
);
await writeFile(path.join(appDir, "icon.svg"), icon + "\n");

const sizes = [16, 32, 48];
const images = await Promise.all(
  sizes.map(async (size) => ({
    size,
    data: await png(tileSvg(size, { scale: 0.8, radius: size * 0.18, detail: size < 48 ? "glyph" : "mark" })),
  })),
);
await writeFile(path.join(appDir, "favicon.ico"), ico(images));

await writeFile(path.join(appDir, "apple-icon.png"), await png(tileSvg(180, { scale: 0.66 })));

console.log("wrote icon.svg, favicon.ico, apple-icon.png");
