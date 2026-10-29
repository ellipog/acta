import { isPrivate } from "@/lib/public-roadmap";
import { actaBoard, publicRoadmap, shippedFeed } from "@/lib/seo";
import { siteUrl } from "@/lib/slugs";

// Acta's changelog, for feed readers
export async function GET() {
  const roadmap = await publicRoadmap(...actaBoard);
  if (!roadmap || isPrivate(roadmap)) return new Response("Not found", { status: 404 });
  return shippedFeed(roadmap, {
    title: "Acta changelog",
    link: `${siteUrl}/changelog`,
    self: `${siteUrl}/changelog/rss.xml`,
    about: "Everything shipped in Acta, newest first.",
  });
}
