import { createClient } from "@supabase/supabase-js";
import { isPrivate, type PublicResult } from "@/lib/public-roadmap";
import { ideaJson, roadmapPage, shownTasks, taskJson } from "@/lib/roadmap-json";
import { publicHref } from "@/lib/slugs";
import { authReady, supabaseKey, supabaseUrl } from "@/lib/supabase/env";

// A published roadmap as JSON, for people who'd rather build the whole page themselves: their own site, a widget,
// a changelog. It holds only what the public page shows, so anyone may read it from anywhere. To vote or send ideas
// from another site, or to filter and page through tasks, there's the roadmap API at /api/roadmap/v1

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
};

export async function GET(request: Request, { params }: { params: Promise<{ workspace: string; board: string }> }) {
  const { workspace, board } = await params;
  if (!authReady) return Response.json({ error: "Not set up" }, { status: 503, headers });
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data } = await supabase.rpc("public_roadmap", { p_workspace: workspace, p_board: board });
  const roadmap = (data ?? null) as PublicResult;
  if (!roadmap || isPrivate(roadmap))
    return Response.json({ error: "There’s no published roadmap here." }, { status: 404, headers });

  const page = roadmapPage(roadmap);
  return Response.json(
    {
      workspace: { name: roadmap.workspace.name, slug: roadmap.workspace.slug, image: roadmap.workspace.image ?? null },
      board: { name: roadmap.board.name, slug: roadmap.board.slug, prefix: roadmap.board.prefix },
      url: new URL(publicHref(workspace, board), request.url).href,
      page: {
        title: page.title,
        tagline: page.tagline,
        stages: page.stageNames,
        announcement: page.announcement || null,
        links: page.links,
        projects: page.showProjects ? (roadmap.board.projects ?? []) : [],
      },
      tasks: shownTasks(roadmap, page).map((t) => taskJson(roadmap, page, t)),
      ideas: roadmap.suggestions.map((s) => ideaJson(page, s)),
    },
    { headers },
  );
}

export const OPTIONS = () => new Response(null, { status: 204, headers });
