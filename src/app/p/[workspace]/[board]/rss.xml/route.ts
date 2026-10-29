import { pageFrom } from "@/lib/board-store";
import { isPrivate } from "@/lib/public-roadmap";
import { publicRoadmap, roadmapUrl, shippedFeed } from "@/lib/seo";
import { siteUrl } from "@/lib/slugs";

// What a published roadmap has shipped, for feed readers
export async function GET(_: Request, { params }: RouteContext<"/p/[workspace]/[board]/rss.xml">) {
  const { workspace, board } = await params;
  const roadmap = await publicRoadmap(workspace, board);
  // Only for pages that show what they've shipped
  if (!roadmap || isPrivate(roadmap) || !pageFrom(roadmap.board.name, roadmap.board.slug, roadmap.board.page).showShipped)
    return new Response("Not found", { status: 404 });
  return shippedFeed(roadmap, {
    title: `${roadmap.workspace.name}: ${roadmap.board.name} shipped`,
    link: roadmapUrl(workspace, board),
    self: `${siteUrl}/p/${workspace}/${board}/rss.xml`,
  });
}
