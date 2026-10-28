import { createClient } from "@supabase/supabase-js";
import { pageFrom } from "@/lib/board-store";
import { isPrivate, type PublicResult } from "@/lib/public-roadmap";
import { publicHref } from "@/lib/slugs";
import { authReady, supabaseKey, supabaseUrl } from "@/lib/supabase/env";

// A published roadmap as JSON, for people who'd rather build the whole page themselves: their own site, a widget,
// a changelog. It holds only what the public page shows, so anyone may read it from anywhere

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

  const page = pageFrom(roadmap.board.name, roadmap.board.slug, roadmap.board.page);
  const key = (n: number) => `${roadmap.board.prefix}-${n}`;
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
        projects: roadmap.board.projects ?? [],
      },
      tasks: roadmap.tasks.map((t) => ({
        id: key(t.number),
        title: t.title,
        description: t.description,
        status: t.status,
        project: t.project,
        start: t.start_on,
        due: page.showDates ? t.due_on : null,
        shipped: t.shipped_on,
        subtasks: { done: t.subtasks.filter((s) => s.done).length, total: t.subtasks.length },
        votes: page.voting ? t.votes : undefined,
        assignee: t.assignee ? { name: t.assignee.name, avatar: t.assignee.avatar } : null,
      })),
      ideas: roadmap.suggestions.map((s) => ({
        id: s.id,
        title: s.title,
        details: s.details,
        by: s.by,
        at: s.at,
        votes: page.voting ? s.votes : undefined,
      })),
    },
    { headers },
  );
}

export const OPTIONS = () => new Response(null, { status: 204, headers });
