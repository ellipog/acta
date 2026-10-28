import { NextResponse, type NextRequest } from "next/server";
import { asApp, githubReady, installationsFor, webhookSecret } from "@/lib/github/app";
import { readState } from "@/lib/github/signature";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuth } from "@/lib/workspace";

// Where GitHub sends people back after installing the app. The installation is only tied to the workspace when the
// state is the one Acta signed for this person, and GitHub confirms they can manage that installation
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const home = new URL("/home", request.nextUrl.origin);
  if (!githubReady) return NextResponse.redirect(home);
  const state = readState(webhookSecret, q.get("state"));
  const auth = await getAuth();
  if (!state || !auth || auth.id !== state.user) return NextResponse.redirect(home);

  const db = createAdminClient();
  const { data: ws } = await db.from("workspaces").select("slug").eq("id", state.workspace).maybeSingle();
  if (!ws) return NextResponse.redirect(home);
  const settings = (result: string) =>
    NextResponse.redirect(new URL(`/${ws.slug}/settings?github=${result}#github`, request.nextUrl.origin));

  const installation = Number(q.get("installation_id"));
  const code = q.get("code");
  if (!Number.isSafeInteger(installation) || installation <= 0 || !code) return settings("cancelled");
  const { data: manager } = await auth.supabase.rpc("is_manager", { ws: state.workspace });
  if (!manager) return settings("forbidden");

  try {
    if (!(await installationsFor(code)).includes(installation)) return settings("forbidden");
    const found = await asApp<{ account: { login: string } | null }>(`/app/installations/${installation}`);
    const { data: taken } = await db
      .from("github_installations")
      .select("workspace_id")
      .eq("id", installation)
      .maybeSingle();
    if (taken && taken.workspace_id !== state.workspace) return settings("taken");
    const { error } = await db.from("github_installations").upsert({
      id: installation,
      workspace_id: state.workspace,
      account: (found.account?.login ?? "GitHub").slice(0, 100),
      installed_by: auth.id,
    });
    if (error) throw error;
  } catch (error) {
    console.error("GitHub setup failed", error);
    return settings("failed");
  }
  return settings("connected");
}
