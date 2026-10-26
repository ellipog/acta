// Dither recipes. Run `bun run dither` after changing anything here.
//
// Every recipe turns one source image (in assets/source) into a 1-bit PNG
// mask in public/dither. Ink pixels are opaque, everything else is
// transparent, so the page decides the color with CSS (see <Dither />).
//
//   crop      region of the source in source pixels, before resizing
//   width     output width in pixels (shown at 2x or 3x with pixelated scaling)
//   matrix    Bayer matrix size: 2, 4 or 8. Bigger = more tonal steps.
//             Use 0 for a plain threshold, which keeps line art crisp.
//   levels    [black, white] input levels, 0-255. Pixels darker than black
//             become solid ink, pixels lighter than white become paper.
//   gamma     > 1 lightens midtones, < 1 darkens them
//   invert    true makes light areas the ink instead of dark ones
//   normalize stretch contrast automatically first (good for photos)
//   fade      { top, bottom, left, right } in output pixels: dissolve those
//             edges into transparency with an ordered dither
//   deep      0-1: also write <name>.deep.png with only the darkest tones,
//             for printing a second ink on top (duotone)
//   mode      "contour" draws contour lines at `bands` levels instead of
//             dithering; `blur` smooths the source first
//
// Photo credits live in assets/source/photos/credits.json.

/** @type {import("../scripts/dither.mjs").Recipe[]} */
export const recipes = [
  // Landing page set: shown at 2x, duotone, with dissolving edges.
  {
    name: "surface-panorama",
    source: "holmes-point-sublime.jpg",
    crop: { left: 72, top: 190, width: 1826, height: 950 },
    width: 640,
    matrix: 4,
    levels: [70, 228],
    gamma: 1.5,
    deep: 0.42,
    fade: { top: 70, left: 48, right: 48, bottom: 36 },
  },
  {
    name: "basalt-rise",
    source: "devils-postpile.jpg",
    crop: { left: 150, top: 110, width: 904, height: 800 },
    width: 220,
    matrix: 4,
    levels: [20, 205],
    gamma: 1.6,
    deep: 0.45,
    fade: { top: 24, bottom: 56, left: 36 },
  },
  {
    name: "karli-hall",
    source: "photos/cave-karli.jpg",
    crop: { left: 24, top: 24, width: 698, height: 976 },
    width: 230,
    matrix: 4,
    normalize: true,
    gamma: 1.25,
    deep: 0.45,
    fade: { bottom: 64, right: 24, top: 12 },
  },
  {
    name: "stalactite-bedrock",
    source: "photos/cave-kingston-stalactite.jpg",
    crop: { left: 20, top: 16, width: 735, height: 940 },
    width: 210,
    matrix: 4,
    normalize: true,
    invert: true,
    gamma: 1.05,
    fade: { bottom: 90, left: 64, right: 64 },
  },

  {
    name: "point-sublime",
    source: "holmes-point-sublime.jpg",
    crop: { left: 44, top: 250, width: 1884, height: 900 },
    width: 576,
    matrix: 4,
    levels: [70, 228],
    gamma: 1.6,
  },
  {
    name: "devils-postpile",
    source: "devils-postpile.jpg",
    crop: { left: 140, top: 60, width: 914, height: 1100 },
    width: 300,
    matrix: 4,
    levels: [20, 200],
    gamma: 1.7,
  },

  // Goldschmidt, Atlas der Krystallformen, Bd. 1 Tafel 13 (Amphibol)
  { name: "crystal-prism", source: "goldschmidt-tafel-13.jpg", crop: { left: 1460, top: 470, width: 500, height: 540 }, width: 160, matrix: 0, levels: [90, 200] },
  { name: "crystal-tablet", source: "goldschmidt-tafel-13.jpg", crop: { left: 420, top: 1310, width: 560, height: 360 }, width: 180, matrix: 0, levels: [90, 200] },
  { name: "crystal-rhomb", source: "goldschmidt-tafel-13.jpg", crop: { left: 1700, top: 2000, width: 820, height: 500 }, width: 200, matrix: 0, levels: [90, 200] },
  { name: "crystal-lozenge", source: "goldschmidt-tafel-13.jpg", crop: { left: 1760, top: 2790, width: 760, height: 420 }, width: 200, matrix: 0, levels: [90, 200] },

  // Goldschmidt, Bd. 1 Tafel 73 (Antimonglanz)
  { name: "crystal-cluster", source: "goldschmidt-tafel-73.jpg", crop: { left: 1060, top: 600, width: 680, height: 700 }, width: 180, matrix: 0, levels: [90, 200] },
  { name: "crystal-shard", source: "goldschmidt-tafel-73.jpg", crop: { left: 320, top: 1560, width: 720, height: 720 }, width: 180, matrix: 0, levels: [90, 200] },

  // Haüy, Traité de minéralogie, atlas (1823), Pl. 79
  { name: "crystal-column", source: "hauy-plate-79.jpg", crop: { left: 860, top: 262, width: 400, height: 568 }, width: 150, matrix: 0, levels: [150, 222] },
  { name: "crystal-tower", source: "hauy-plate-79.jpg", crop: { left: 1745, top: 272, width: 480, height: 790 }, width: 160, matrix: 0, levels: [150, 222] },
  { name: "crystal-block", source: "hauy-plate-79.jpg", crop: { left: 790, top: 940, width: 580, height: 440 }, width: 190, matrix: 0, levels: [150, 222] },

  // Photographs (CC0 / public domain, via Openverse)
  { name: "cave-karli", source: "photos/cave-karli.jpg", crop: { left: 24, top: 24, width: 698, height: 976 }, width: 300, matrix: 4, normalize: true, gamma: 1.2 },
  { name: "cave-ice-beam", source: "photos/cave-ice-beam.jpg", width: 480, matrix: 8, normalize: true, gamma: 2 },
  { name: "cave-ice-chamber", source: "photos/cave-ice-chamber.jpg", width: 480, matrix: 8, normalize: true, gamma: 2.2 },
  { name: "cave-stalactites", source: "photos/cave-stalactites.jpg", width: 480, matrix: 4, normalize: true, gamma: 1.3 },
  { name: "cave-kingston-stalactite", source: "photos/cave-kingston-stalactite.jpg", crop: { left: 20, top: 16, width: 735, height: 940 }, width: 300, matrix: 4, normalize: true, gamma: 1.5 },
  { name: "terrain-mars-melas-chasma", source: "photos/terrain-mars-melas-chasma.jpg", width: 640, matrix: 4, normalize: true, gamma: 2.2 },
  { name: "terrain-badlands-strata", source: "photos/terrain-badlands-strata.jpg", width: 640, matrix: 4, normalize: true, gamma: 1.2 },
  { name: "terrain-mars-crater", source: "photos/terrain-mars-crater.jpg", width: 480, matrix: 4, normalize: true },
  { name: "terrain-mars-relief", source: "photos/terrain-mars-relief.jpg", width: 480, matrix: 4, normalize: true, gamma: 1.5 },
  { name: "terrain-coyote-buttes", source: "photos/terrain-coyote-buttes.jpg", width: 360, matrix: 4, normalize: true, gamma: 1.2 },
  { name: "rock-basalt-lake", source: "photos/rock-basalt-lake.jpg", width: 300, matrix: 4, normalize: true, gamma: 1.2 },
  { name: "rock-basalt-columns", source: "photos/rock-basalt-columns.jpg", width: 480, matrix: 4, normalize: true, gamma: 1.2 },
  { name: "mineral-lapis-surface", source: "photos/mineral-lapis-surface.jpg", width: 400, matrix: 4, normalize: true, gamma: 2.2 },
  { name: "mineral-lapis-carving", source: "photos/mineral-lapis-carving.jpg", width: 360, matrix: 4, normalize: true, gamma: 1.4 },
  { name: "mineral-pyrite-cube", source: "photos/mineral-pyrite-cube.jpg", width: 360, matrix: 4, normalize: true, gamma: 1.2 },
  { name: "mineral-geode-interior", source: "photos/mineral-geode-interior.jpg", width: 480, matrix: 8, normalize: true, gamma: 1.9 },
];

// Sources copied (downsized) to public/dither/src for the live playground.
export const playgroundSources = [
  "holmes-point-sublime.jpg",
  "devils-postpile.jpg",
  "goldschmidt-tafel-13.jpg",
  "hauy-plate-79.jpg",
  "photos/cave-karli.jpg",
  "photos/cave-kingston-stalactite.jpg",
  "photos/terrain-badlands-strata.jpg",
  "photos/terrain-mars-crater.jpg",
  "photos/rock-basalt-columns.jpg",
  "photos/mineral-pyrite-cube.jpg",
  "photos/mineral-lapis-carving.jpg",
];
