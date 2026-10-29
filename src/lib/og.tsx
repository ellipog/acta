import "server-only";
import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import { join } from "node:path";
import { inks } from "./seo";

// Link preview images, drawn in Acta's inks: the wordmark, plain words and a band of dithered canyon. Images come
// from public/, read at the project root

const files = new Map<string, Promise<string>>();

/** A file in public/ as a data address, for an image in a preview */
export function asset(path: string, type = "image/png") {
  if (!files.has(path))
    files.set(
      path,
      readFile(join(process.cwd(), "public", path), "base64").then((data) => `data:${type};base64,${data}`),
    );
  return files.get(path)!;
}

export const previewSize = { width: 1200, height: 630 };

/** The canyon band along the bottom of the site's banner, under whatever goes above it */
export async function Canyon({ height }: { height: number }) {
  const banner = await asset("logos/banner/acta-banner-panorama.png");
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height, overflow: "hidden", display: "flex" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn into an image, not a page */}
      <img src={banner} width={1200} height={630} alt="" style={{ position: "absolute", left: 0, bottom: 0 }} />
    </div>
  );
}

export async function Lockup({ height }: { height: number }) {
  const svg = await asset("logos/lockup/acta-lockup-black.svg", "image/svg+xml");
  // The lockup's own proportions, 99.56 by 28
  // eslint-disable-next-line @next/next/no-img-element -- drawn into an image, not a page
  return <img src={svg} height={height} width={Math.round((height * 99.56) / 28)} alt="" />;
}

export const frame = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  background: inks.page,
  color: inks.ink,
} as const;

/** The preview for links to Acta: the banner, with what Acta is set in the clearing above the canyon */
export async function siteImage() {
  const banner = await asset("logos/banner/acta-banner-panorama.png");
  return new ImageResponse(
    (
      <div style={frame}>
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn into an image, not a page */}
        <img src={banner} width={1200} height={630} alt="" style={{ position: "absolute", left: 0, top: 0 }} />
        <div
          style={{
            position: "absolute",
            top: 196,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            fontSize: 34,
            letterSpacing: "-0.01em",
            color: inks.ink2,
          }}
        >
          Project management for teams and their AI agents
        </div>
      </div>
    ),
    previewSize,
  );
}
