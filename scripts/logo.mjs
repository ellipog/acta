// Writes the app icons and the logo kit from the mark in src/lib/logo.ts.
// Run `bun run logo` after changing the drawing.
//
//   src/app/icon.svg        tab icon, ink on light tabs and paper on dark ones
//   src/app/favicon.ico     16/32/48 px fallback on a paper tile
//   src/app/apple-icon.png  180 px home screen icon, full bleed paper
//   public/logos/           the mark and the ACTA lockups on transparent, in
//                           dark, light, black and white; square tiles and
//                           1200×630 banners on solid colors and on a dither.
//                           Every file comes as SVG and PNG at the same size,
//                           except the dither ones, which are PNG only.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { logoDetailFor, logoPaths, logoViewBox } from "../src/lib/logo.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appDir = path.join(root, "src/app");
const kitDir = path.join(root, "public/logos");

const paper = "#f3f0e8";
const ink = "#1d2230";
const inkDark = "#e9e5db";
const bedrock = "#1a1d24";
const lapis = "#2c4a8c";
const onAccent = "#f7f5ef";

const n = (v) => Math.round(v * 100) / 100;
// For a viewBox, so rounding never trims the ink at its edge.
const up = (v) => Math.ceil(v * 100) / 100;

// The mark in `color`. With `backing`, its silhouette is filled first so
// whatever lies behind doesn't show through between the hatching.
function markSvg(detail, { color = "currentColor", attrs = "", head = "", backing } = {}) {
  const paths = logoPaths(detail);
  const body = paths
    .map(({ d, width, fill, dots }) =>
      fill != null
        ? `<path d="${d}" fill="${color}" fill-opacity="${fill}" stroke="none"/>`
        : `<path d="${d}" stroke-width="${width}"${dots ? ` stroke-dasharray="0 ${dots}"` : ""}/>`,
    )
    .join("");
  // The last layer is the outline, which is also the silhouette.
  const under = backing ? `<path d="${paths.at(-1).d}" fill="${backing}" stroke="none"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logoViewBox(detail).join(" ")}" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round"${attrs}>${head}${under}${body}</svg>`;
}

function markWidth(detail, height) {
  const [, , vw, vh] = logoViewBox(detail);
  return (height * vw) / vh;
}

// The mark `height` tall with its top-left corner at x, y.
function placeMark(detail, x, y, height, options) {
  const size = ` x="${n(x)}" y="${n(y)}" width="${n(markWidth(detail, height))}" height="${n(height)}"`;
  return markSvg(detail, { ...options, attrs: size });
}

// ACTA in Marcellus, outlined so the files don't need the font, and set the
// way the Wordmark sets it: 0.18em tracking plus the font's TA kern. Font
// units, 2048 to the em, y down from the baseline.
const em = 2048;
const glyphs = {
  A: "M1135 0V-4Q1137-9 1138-19Q1139-29 1139-37Q1139-68 1130.5-105.5Q1122-143 1098-199L977-471Q921-473 828-473Q735-473 627-473Q548-473 474.5-473Q401-473 342-471L227-207Q212-170 195-126Q178-82 178-37Q178-24 180-15.5Q182-7 184-4V0H-20V-4Q-2-23 25-71.5Q52-120 84-193L657-1464H737L1280-242Q1299-199 1319.5-158.5Q1340-118 1358-86Q1376-54 1390-32Q1404-10 1409-4V0ZM487-559Q545-559 606-559.5Q667-560 725.5-560.5Q784-561 838-561.5Q892-562 936-563L655-1198L379-559Z",
  C: "M1303-1214 1294-1210Q1216-1282 1106.5-1325Q997-1368 866-1368Q740-1368 635-1328.5Q530-1289 454.5-1214Q379-1139 337-1030Q295-921 295-782Q295-629 335-496.5Q375-364 454-267Q533-170 651.5-114.5Q770-59 928-59Q985-59 1042-71Q1099-83 1151.5-106.5Q1204-130 1250.5-163.5Q1297-197 1335-240L1346-233L1266-29Q1191 0 1100.5 15.5Q1010 31 918 31Q733 31 579.5-22.5Q426-76 315.5-174Q205-272 143.5-409.5Q82-547 82-715Q82-810 106.5-902Q131-994 178-1077Q225-1160 294-1229.5Q363-1299 451.5-1350Q540-1401 646.5-1429.5Q753-1458 877-1458Q1070-1458 1235-1399Z",
  T: "M520-1346Q402-1346 307-1335.5Q212-1325 143-1313Q63-1298 0-1280L29-1442Q41-1441 65-1440Q89-1439 118.5-1438Q148-1437 180.5-1436.5Q213-1436 242-1435.5Q271-1435 293.5-1434.5Q316-1434 326-1434H897Q907-1434 929.5-1434.5Q952-1435 981-1435.5Q1010-1436 1042.5-1436.5Q1075-1437 1104.5-1438Q1134-1439 1158-1440Q1182-1441 1194-1442L1223-1280Q1159-1298 1079-1313Q1010-1325 915-1335.5Q820-1346 702-1346V-391Q702-306 704.5-242.5Q707-179 710.5-133Q714-87 719.5-56Q725-25 731-4V0H492V-4Q498-25 503-56Q508-87 512-133Q516-179 518-242.5Q520-306 520-391Z",
};
const advance = { A: 1389, C: 1386, T: 1223 };
const kern = { TA: -102 };
const capHeight = 1434;

let pen = 0;
const letters = [..."ACTA"].map((ch, i, word) => {
  const at = pen;
  pen += advance[ch] + (kern[ch + word[i + 1]] ?? 0) + 0.18 * em;
  return [ch, at];
});
// Where the ink reaches: the A's feet overhang its advance, its apex and the
// C's curves overshoot the cap height and baseline.
const wordInk = { left: -20, right: letters.at(-1)[1] + 1409, top: -1464, bottom: 31 };

// ACTA set at `font` px with its baseline origin at x, y.
function wordmarkSvg(x, y, font, color) {
  const paths = letters.map(([ch, at]) => `<path transform="translate(${n(at)} 0)" d="${glyphs[ch]}"/>`).join("");
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${font / em})" fill="${color}">${paths}</g>`;
}

// The lockups in the header's own px: the Wordmark is a 28 px mark and ACTA
// at 20 px, 10 px apart, caps centred on the mark. Stacked puts a larger mark
// over the same word. Every file here shows the mark well over 64 px, so it
// is drawn as the plate rather than the header's heavier mark.
function lockup(color, { stacked = false } = {}) {
  const detail = "plate";
  const font = 20;
  const k = font / em;
  if (!stacked) {
    const w = markWidth(detail, 28);
    const body = placeMark(detail, 0, 0, 28, { color }) + wordmarkSvg(w + 10, 14 + (capHeight * k) / 2, font, color);
    return { width: w + 10 + wordInk.right * k, height: 28, body };
  }
  const h = 44;
  const gap = 12;
  const wordWidth = (wordInk.right - wordInk.left) * k;
  const width = Math.max(wordWidth, markWidth(detail, h));
  const baseline = h + gap - wordInk.top * k;
  const body =
    placeMark(detail, (width - markWidth(detail, h)) / 2, 0, h, { color }) +
    wordmarkSvg((width - wordWidth) / 2 - wordInk.left * k, baseline, font, color);
  return { width, height: baseline + wordInk.bottom * k, body };
}

// A lockup scaled to `height` with its top-left corner at x, y.
function placeLockup({ width, height: vh, body }, x, y, height) {
  return `<svg x="${n(x)}" y="${n(y)}" width="${n((height * width) / vh)}" height="${n(height)}" viewBox="0 0 ${up(width)} ${up(vh)}">${body}</svg>`;
}

function canvasSvg(width, height, background, body) {
  const rect = background ? `<rect width="${width}" height="${height}" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}">${rect}${body}</svg>`;
}

// The mark centred on a square of paper, `scale` being its height as a share
// of the square.
function tileSvg(size, { scale, radius = 0, detail = logoDetailFor(size * scale), background = paper, color = ink, backing }) {
  const h = size * scale;
  const w = markWidth(detail, h);
  const rect = background ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${rect}${placeMark(detail, (size - w) / 2, (size - h) / 2, h, { color, backing })}</svg>`;
}

// A 1200×630 social card with the lockup `height` tall, centred on `middle`.
function bannerSvg(background, color, { middle = 315, height = 150 } = {}) {
  const word = lockup(color);
  const width = (height * word.width) / word.height;
  return canvasSvg(1200, 630, background, placeLockup(word, 600 - width / 2, middle - height / 2, height));
}

const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

// A dither from public/dither drawn as <Dither> draws it: its alpha tinted
// one color and scaled by a whole number, so the pattern never resamples.
// `left` and `top` place the scaled image on the canvas; it is cropped to fit.
async function ditherLayer(name, color, scale, canvas, left, top) {
  const file = path.join(root, "public/dither", `${name}.png`);
  const { width, height } = await sharp(file).metadata();
  const crop = { left: Math.max(0, -left), top: Math.max(0, -top) };
  crop.width = Math.min(width * scale - crop.left, canvas.width - Math.max(0, left));
  crop.height = Math.min(height * scale - crop.top, canvas.height - Math.max(0, top));
  const alpha = await sharp(file)
    .extractChannel("alpha")
    .resize(width * scale, height * scale, { kernel: "nearest" })
    .extract(crop)
    .toBuffer();
  const input = await sharp({ create: { width: crop.width, height: crop.height, channels: 3, background: color } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  return { input, left: Math.max(0, left), top: Math.max(0, top) };
}

async function ditherPng(canvas, background, layers, overlay) {
  const inputs = await Promise.all(layers.map(([name, color, scale, left, top]) => ditherLayer(name, color, scale, canvas, left, top)));
  return sharp({ create: { ...canvas, channels: 4, background } })
    .composite([...inputs, { input: Buffer.from(overlay) }])
    .png()
    .toBuffer();
}

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

const icon = markSvg("glyph", {
  attrs: ` color="${ink}"`,
  head: `<style>@media (prefers-color-scheme: dark) { svg { color: ${inkDark} } }</style>`,
});
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

// The kit. Each entry is a file name and either an SVG, written as .svg and
// rendered to .png, or a finished PNG buffer.
const colorways = { dark: ink, light: inkDark, black: "#000", white: "#fff" };
const tiles = {
  paper: [paper, ink],
  bedrock: [bedrock, inkDark],
  white: ["#fff", "#000"],
  black: ["#000", "#fff"],
  lapis: [lapis, onAccent],
};
const markFile = (detail, color) =>
  markSvg(detail, { color, attrs: ` width="${n(markWidth(detail, 1024))}" height="1024"` });
const lockupFile = (color, height, options) => {
  const { width, height: vh, body } = lockup(color, options);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${up(width)} ${up(vh)}" width="${n((height * width) / vh)}" height="${height}">${body}</svg>`;
};

const panorama = { width: 1200, height: 630 };
const kit = [
  ...Object.entries(colorways).flatMap(([name, color]) => [
    [`mark/acta-mark-${name}`, markFile("plate", color)],
    [`mark/acta-mark-solid-${name}`, markFile("glyph", color)],
    [`lockup/acta-lockup-${name}`, lockupFile(color, 512)],
    [`lockup/acta-lockup-stacked-${name}`, lockupFile(color, 1024, { stacked: true })],
  ]),
  ...Object.entries(tiles).flatMap(([name, [background, color]]) => [
    [`tile/acta-tile-${name}`, tileSvg(1024, { scale: 0.66, background, color })],
    [`banner/acta-banner-${name}`, bannerSvg(background, color)],
  ]),
  // The hero's plate: Holmes's panorama in lapis with its depths in ink.
  // The tile sets the mark on paper over it; the banner lays it out like the
  // hero, the lockup on open paper and the canyon below.
  [
    "tile/acta-tile-panorama",
    await ditherPng(
      { width: 1024, height: 1024 },
      paper,
      [
        ["surface-panorama", lapis, 4, -768, -154],
        ["surface-panorama.deep", ink, 4, -768, -154],
      ],
      tileSvg(1024, { scale: 0.66, background: null, backing: paper }),
    ),
  ],
  [
    "banner/acta-banner-panorama",
    await ditherPng(
      panorama,
      paper,
      [
        ["surface-panorama", lapis, 2, -40, 250],
        ["surface-panorama.deep", ink, 2, -40, 250],
      ],
      bannerSvg(null, ink, { middle: 125, height: 100 }),
    ),
  ],
];

for (const dir of new Set(kit.map(([file]) => path.dirname(file)))) {
  await mkdir(path.join(kitDir, dir), { recursive: true });
}
await Promise.all(
  kit.map(async ([file, art]) => {
    const target = path.join(kitDir, file);
    if (Buffer.isBuffer(art)) return writeFile(`${target}.png`, art);
    await writeFile(`${target}.svg`, art + "\n");
    await writeFile(`${target}.png`, await png(art));
  }),
);

console.log(`wrote ${kit.length} logos to public/logos`);
