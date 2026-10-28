import { NextResponse, type NextRequest } from "next/server";
import { githubReady, installUrl, webhookSecret } from "@/lib/github/app";
import { signState } from "@/lib/github/signature";
import { getAuth } from "@/lib/workspace";

// Sends an owner or admin to GitHub to install the app, carrying which workspace it's for
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("workspace") ?? "";
  const back = new URL(`/${encodeURIComponent(slug)}/settings`, request.nextUrl.origin);
  if (!githubReady) return NextResponse.redirect(back);
  const auth = await getAuth();
  if (!auth) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(back.pathname)}`, request.url));
  const { data: ws } = await auth.supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  const { data: manager } = ws ? await auth.supabase.rpc("is_manager", { ws: ws.id }) : { data: false };
  if (!ws || !manager) return NextResponse.redirect(back);
  return NextResponse.redirect(installUrl(signState(webhookSecret, { workspace: ws.id, user: auth.id })));
}
