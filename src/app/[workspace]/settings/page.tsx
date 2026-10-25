import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AppTopBar } from "@/components/app-chrome";
import { Skeleton } from "@/components/ui/display";
import type { Label, Project } from "@/lib/board-store";
import { getSession, getWorkspace } from "@/lib/workspace";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = {
  title: "Settings · Acta",
  robots: { index: false, follow: false },
};

export default function SettingsPage({ params }: PageProps<"/[workspace]/settings">) {
  return (
    <Suspense
      fallback={
        <>
          <AppTopBar />
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="mt-10 h-40" />
            <Skeleton className="mt-6 h-64" />
          </main>
        </>
      }
    >
      <Settings params={params} />
    </Suspense>
  );
}

async function Settings({ params }: { params: PageProps<"/[workspace]/settings">["params"] }) {
  const { workspace: slug } = await params;
  const ws = await getWorkspace(slug);
  if (!ws) {
    if (!(await getSession())) redirect(`/login?next=${encodeURIComponent(`/${slug}/settings`)}`);
    notFound();
  }
  const { supabase } = (await getSession())!;
  const manager = ws.workspace.role !== "member";
  const [{ data: link }, { data: boards }] = await Promise.all([
    manager
      ? supabase.from("workspace_links").select("token").eq("workspace_id", ws.workspace.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("boards")
      .select("id, slug, name, labels, projects")
      .eq("workspace_id", ws.workspace.id)
      .order("position")
      .order("created_at"),
  ]);
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
          invite={link?.token ? `${origin}/join/${link.token}` : null}
        />
      </main>
    </>
  );
}
