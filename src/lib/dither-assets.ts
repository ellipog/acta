import manifest from "./dither-manifest.json";

export type DitherName = keyof typeof manifest;

type Credit = {
  kind: "engraving" | "crystal" | "photo";
  credit: string;
  license: "Public domain" | "CC0";
  href: string;
};

const holmes: Credit = { kind: "engraving", credit: "W. H. Holmes, Panorama from Point Sublime (1882)", license: "Public domain", href: "https://commons.wikimedia.org/wiki/File:Duttonnp000086AAA2.jpg" };
const postpile: Credit = { kind: "photo", credit: "Dexter Perkins, Devil's Postpile (2001)", license: "CC0", href: "https://commons.wikimedia.org/wiki/File:Columnar_basalt_at_Devil%27s_Postpile_(GeoDIL_number_-_555).jpg" };
const goldschmidt13: Credit = { kind: "crystal", credit: "V. Goldschmidt, Atlas der Krystallformen, Tafel 13 (1913)", license: "Public domain", href: "https://archive.org/details/atlasderkrystalltaf01gold" };
const goldschmidt73: Credit = { kind: "crystal", credit: "V. Goldschmidt, Atlas der Krystallformen, Tafel 73 (1913)", license: "Public domain", href: "https://archive.org/details/atlasderkrystalltaf01gold" };
const hauy: Credit = { kind: "crystal", credit: "R.-J. Haüy, Traité de minéralogie, atlas, Pl. 79 (1823)", license: "Public domain", href: "https://wellcomecollection.org/works/nkggvext" };
const karli: Credit = { kind: "photo", credit: "Interior of Karli Cave, via rawpixel", license: "CC0", href: "https://www.rawpixel.com/image/9205856/interior-karli-cave" };
const kingston: Credit = { kind: "photo", credit: "Large stalactite, Kingston Cave, via rawpixel", license: "CC0", href: "https://www.rawpixel.com/image/13955976/image-art-public-domain-nature" };
const geode: Credit = { kind: "photo", credit: "Reid Campbell, Inside a geode", license: "CC0", href: "https://www.flickr.com/photos/195591092@N07/52065923802" };
const crater: Credit = { kind: "photo", credit: "NASA/JPL/UArizona HiRISE, Utopia Planitia", license: "CC0", href: "https://www.flickr.com/photos/71688597@N05/51509321705" };
const relief: Credit = { kind: "photo", credit: "NASA/JPL/UArizona HiRISE, tectonic and fluvial terrain", license: "CC0", href: "https://www.flickr.com/photos/71688597@N05/52559912316" };

const credits: Record<DitherName, Credit> = {
  "surface-panorama": holmes,
  "point-sublime": holmes,
  "basalt-rise": postpile,
  "devils-postpile": postpile,
  "karli-hall": karli,
  "cave-karli": karli,
  "stalactite-bedrock": kingston,
  "cave-kingston-stalactite": kingston,
  "terrain-mars-crater": crater,
  "terrain-mars-relief": relief,
  "crystal-prism": goldschmidt13,
  "crystal-tablet": goldschmidt13,
  "crystal-rhomb": goldschmidt13,
  "crystal-lozenge": goldschmidt13,
  "crystal-cluster": goldschmidt73,
  "crystal-shard": goldschmidt73,
  "crystal-column": hauy,
  "crystal-tower": hauy,
  "crystal-block": hauy,
  "cave-ice-beam": { kind: "photo", credit: "Jonatan Pie, Ice Cave, via StockSnap", license: "CC0", href: "https://stocksnap.io/photo/ice-cave-BUWUYA836O" },
  "cave-ice-chamber": { kind: "photo", credit: "US Forest Service, Northern Region, Ice cave", license: "Public domain", href: "https://www.flickr.com/photos/40882383@N03/51882349396" },
  "cave-stalactites": { kind: "photo", credit: "The Fun Chronicles, Stalactites in Calico Mine", license: "CC0", href: "https://www.flickr.com/photos/196406308@N04/52344827589" },
  "terrain-mars-melas-chasma": { kind: "photo", credit: "NASA/JPL/UArizona HiRISE, Melas Chasma", license: "CC0", href: "https://www.flickr.com/photos/71688597@N05/52000012996" },
  "terrain-badlands-strata": { kind: "photo", credit: "Badlands National Park, via rawpixel", license: "CC0", href: "https://www.rawpixel.com/image/4023284/photo-image-nature-mountain-landscape" },
  "terrain-coyote-buttes": { kind: "photo", credit: "BLM Arizona, Coyote Buttes South", license: "Public domain", href: "https://www.flickr.com/photos/141771506@N07/54821590209" },
  "rock-basalt-lake": { kind: "photo", credit: "Juhele_CZ, Panská skála basalt", license: "CC0", href: "https://www.flickr.com/photos/96541566@N06/52624421252" },
  "rock-basalt-columns": { kind: "photo", credit: "Juhele_CZ, Geopark Spořilov basalt", license: "CC0", href: "https://www.flickr.com/photos/96541566@N06/52154596850" },
  "mineral-lapis-surface": { kind: "photo", credit: "saturns_day, Lapis lazuli", license: "Public domain", href: "https://www.flickr.com/photos/192478860@N04/54605160696" },
  "mineral-lapis-carving": { kind: "photo", credit: "Lapis lazuli carving, via rawpixel", license: "CC0", href: "https://www.rawpixel.com/image/7655158/photo-image-vintage-art-public-domain" },
  "mineral-pyrite-cube": { kind: "photo", credit: "Pyrite crystal, via rawpixel", license: "CC0", href: "https://www.rawpixel.com/image/6082072/pyrite-crystal" },
  "mineral-geode-interior": geode,
};

export type DitherAsset = Credit & { name: DitherName; width: number; height: number; deep: boolean };

export const ditherAssets = Object.fromEntries(
  (Object.keys(manifest) as DitherName[]).map((name) => [name, { name, ...manifest[name], ...credits[name] }]),
) as Record<DitherName, DitherAsset>;

export const playgroundSources = [
  { label: "Point Sublime", file: "holmes-point-sublime.jpg" },
  { label: "Karli Cave", file: "cave-karli.jpg" },
  { label: "Kingston stalactite", file: "cave-kingston-stalactite.jpg" },
  { label: "Badlands strata", file: "terrain-badlands-strata.jpg" },
  { label: "Mars crater", file: "terrain-mars-crater.jpg" },
  { label: "Basalt columns", file: "rock-basalt-columns.jpg" },
  { label: "Devil's Postpile", file: "devils-postpile.jpg" },
  { label: "Pyrite cube", file: "mineral-pyrite-cube.jpg" },
  { label: "Lapis carving", file: "mineral-lapis-carving.jpg" },
  { label: "Goldschmidt Tafel 13", file: "goldschmidt-tafel-13.jpg" },
  { label: "Haüy Pl. 79", file: "hauy-plate-79.jpg" },
] as const;
