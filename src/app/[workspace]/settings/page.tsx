import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AppTopBar } from "@/components/app-chrome";
import type { Label, Project } from "@/lib/board-store";
import { can } from "@/lib/live";
import { getAuth, getWorkspace } from "@/lib/workspace";
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
      .select("id, slug, name, labels, projects, workspaces!inner(slug)")
      .eq("workspaces.slug", slug)
      .order("position")
      .order("created_at"),
  ]);
  if (!ws) notFound();
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
            labels: (b.labels ?? []) as Label[],
            projects: (b.projects ?? []) as Project[],
          }))}
          invite={inviting && link?.token ? `${origin}/join/${link.token}` : null}
        />
      </main>
    </>
  );
}
