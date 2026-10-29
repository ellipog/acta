import { ImageResponse } from "next/og";
import { pageFrom, stageOf, type Task } from "@/lib/board-store";
import { Canyon, frame, Lockup, previewSize, siteImage } from "@/lib/og";
import { isPrivate } from "@/lib/public-roadmap";
import { inks, publicRoadmap } from "@/lib/seo";

// A roadmap's link preview: its title and introduction in its own accent, how much is planned, under way and
// shipped, over the canyon. Private and missing roadmaps get Acta's own

export const alt = "A public roadmap made with Acta";
export const size = previewSize;
export const contentType = "image/png";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : text);

export default async function Image({ params }: { params: Promise<{ workspace: string; board: string }> }) {
  const { workspace, board } = await params;
  const roadmap = await publicRoadmap(workspace, board);
  if (!roadmap || isPrivate(roadmap)) return siteImage();
  const page = pageFrom(roadmap.board.name, roadmap.board.slug, roadmap.board.page);
  const accent = page.color || inks.tone[page.accent];
  const live = roadmap.tasks.filter((t) => t.status !== "canceled");
  const count = (stage: ReturnType<typeof stageOf>) =>
    live.filter((t) => stageOf({ status: t.status } as Task) === stage).length;
  const stages = [
    { label: page.stageNames.planned, n: count("planned"), tone: inks.ink3 },
    { label: page.stageNames.progress, n: count("progress"), tone: accent },
    { label: page.stageNames.shipped, n: count("shipped"), tone: inks.tone.malachite },
  ].filter((s) => s.label);
  // Previews can't draw WebP, which is what uploaded pictures are, so only older PNG and JPEG ones show
  const image = roadmap.workspace.image;
  const picture = image?.startsWith("https://") && /\.(png|jpe?g)$/i.test(image) ? image : null;

  return new ImageResponse(
    (
      <div style={frame}>
        <div style={{ height: 12, background: accent, display: "flex" }} />
        <div style={{ display: "flex", flexDirection: "column", padding: "52px 72px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {picture ? (
                // eslint-disable-next-line @next/next/no-img-element -- drawn into an image, not a page
                <img src={picture} width={44} height={44} alt="" style={{ objectFit: "cover" }} />
              ) : null}
              <span style={{ fontSize: 22, letterSpacing: "0.14em", textTransform: "uppercase", color: inks.ink3 }}>
                {clip(roadmap.workspace.name, 40)}
              </span>
            </div>
            <Lockup height={30} />
          </div>
          <div style={{ marginTop: 34, fontSize: 76, lineHeight: 1.02, letterSpacing: "-0.02em", display: "flex" }}>
            {clip(page.title, 48)}
          </div>
          {page.tagline ? (
            <div style={{ marginTop: 20, fontSize: 30, lineHeight: 1.3, color: inks.ink2, maxWidth: 980, display: "flex" }}>
              {clip(page.tagline.replace(/\s+/g, " "), 120)}
            </div>
          ) : null}
          <div style={{ marginTop: 30, display: "flex", gap: 36 }}>
            {stages.map((s) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 26, color: inks.ink2 }}>
                <div style={{ width: 16, height: 16, background: s.tone, display: "flex" }} />
                <span style={{ color: inks.ink }}>{s.n}</span> {clip(s.label.toLowerCase(), 20)}
              </div>
            ))}
          </div>
        </div>
        <Canyon height={150} />
      </div>
    ),
    size,
  );
}
