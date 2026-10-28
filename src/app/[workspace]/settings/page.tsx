import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AppTopBar } from "@/components/app-chrome";
import type { Label, Project } from "@/lib/board-store";
import { githubReady } from "@/lib/github/app";
import { can } from "@/lib/live";
import { getAuth, getWorkspace } from "@/lib/workspace";
import type { GitHubInfo } from "./github-section";
import { SettingsLoading } from "./settings-loading";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = {
  title: "Settings · Acta",
  robots: { index: false, follow: false },
};

export default function SettingsPage({ params }: PageProps<"/[workspace]/settings">) {
  return (
    // The inner fallback reads the address, which only the browser knows when it moves here. The outer one is
    // what the page starts as
    <Suspense fallback={<SettingsLoading />}>
      <Suspense fallback={<SettingsLoading cached />}>
        <Settings params={params} />
      </Suspense>
    </Suspense>
  );
}

async function Settings({ params }: { params: PageProps<"/[workspace]/settings">["params"] }) {
  const { workspace: slug } = await params;
  const auth = await getAuth();
  if (!auth) redirect(`/login?next=${encodeURIComponent(`/${slug}/settings`)}`);
  const [ws, { data: link }, { data: boards }] = await Promise.all([
    getWorkspace(slug),
    auth.supabase.from("workspace_links").select("token, workspaces!inner(slug)").eq("workspaces.slug", slug).maybeSingle(),
    auth.supabase
      .from("boards")
      .select("*, workspaces!inner(slug)")
      .eq("workspaces.slug", slug)
      .order("position")
      .order("created_at"),
  ]);
  if (!ws) notFound();
  const github = githubReady ? await githubInfo(auth.supabase, ws.workspace.id) : null;
  const inviting = can(ws.workspace.role, ws.workspace.permissions, "invite");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const back = ws.boards[0] ? { href: `/${slug}/${ws.boards[0].slug}`, label: "Back to boards" } : undefined;

  return (
    <>
      <AppTopBar workspace={ws.workspace} back={back} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <SettingsView
          me={ws.me}
          workspace={ws.workspace}
          members={ws.members}
          boards={(boards ?? []).map((b) => ({
            id: b.id,
            slug: b.slug,
            name: b.name,
            icon: b.icon ?? undefined,
            labels: (b.labels ?? []) as Label[],
            projects: (b.projects ?? []) as Project[],
          }))}
          invite={inviting && link?.token ? `${origin}/join/${link.token}` : null}
          github={github}
        />
      </main>
    </>
  );
}

// Before the GitHub migration there are no tables to read, and the section stays hidden
async function githubInfo(
  supabase: NonNullable<Awaited<ReturnType<typeof getAuth>>>["supabase"],
  workspace: string,
): Promise<GitHubInfo | null> {
  const [installs, repos] = await Promise.all([
    supabase.from("github_installations").select("id, account").eq("workspace_id", workspace).order("created_at"),
    supabase
      .from("github_repos")
      .select("id, full_name, private, board_id, settings, github_installations!inner(workspace_id)")
      .eq("github_installations.workspace_id", workspace)
      .order("full_name"),
  ]);
  if (installs.error || repos.error) return null;
  return {
    installations: installs.data.map((i) => ({ id: i.id, account: i.account })),
    repos: repos.data.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      private: r.private,
      board: r.board_id,
      settings: r.settings,
    })),
  };
}
