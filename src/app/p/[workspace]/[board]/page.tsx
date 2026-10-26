import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { LogoMark } from "@/components/ui/logo-mark";
import { Skeleton } from "@/components/ui/display";
import { Dither } from "@/components/ui/dither";
import { pageFrom } from "@/lib/board-store";
import { isPrivate, visitorCookie, type PublicResult } from "@/lib/public-roadmap";
import { createClient } from "@/lib/supabase/server";
import { PublicView } from "./public-view";

const getRoadmap = cache(async (workspace: string, board: string) => {
  const supabase = await createClient();
  const visitor = (await cookies()).get(visitorCookie)?.value ?? null;
  const { data } = await supabase.rpc("public_roadmap", {
    p_workspace: workspace,
    p_board: board,
    p_visitor: visitor,
  });
  return (data ?? null) as PublicResult;
});

export async function generateMetadata({ params }: PageProps<"/p/[workspace]/[board]">): Promise<Metadata> {
  const { workspace, board } = await params;
  const roadmap = await getRoadmap(workspace, board);
  if (!roadmap) return { title: "Roadmap not found · Acta", robots: { index: false } };
  if (isPrivate(roadmap))
    return {
      title: `${roadmap.workspace.name} · Acta`,
      robots: { index: false },
    };
  const page = pageFrom(roadmap.board.name, roadmap.board.slug, roadmap.board.page);
  const description = page.tagline || `What ${roadmap.workspace.name} is building, and what’s shipped.`;
  return {
    title: `${page.title} · ${roadmap.workspace.name}`,
    description,
    openGraph: {
      title: `${page.title} · ${roadmap.workspace.name}`,
      description,
      type: "website",
    },
  };
}

export default function PublicRoadmapPage({ params }: PageProps<"/p/[workspace]/[board]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Roadmap params={params} />
    </Suspense>
  );
}

async function Roadmap({ params }: { params: PageProps<"/p/[workspace]/[board]">["params"] }) {
  const { workspace, board } = await params;
  const roadmap = await getRoadmap(workspace, board);
  if (!roadmap) notFound();
  if (isPrivate(roadmap))
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-page px-5 py-16 text-center">
        <div className="relative h-36 w-44">
          <Dither name="cave-kingston-stalactite" tone="muted" fill smooth />
        </div>
        <p className="mt-8 font-mono text-[11px] tracking-[0.14em] text-ink-3 uppercase">{roadmap.workspace.name}</p>
        <h1 className="mt-2 font-display text-4xl">This roadmap is private</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-2">
          {roadmap.workspace.name} hasn’t opened it to visitors yet. Check back later.
        </p>
        <Link href="/" className="mt-12 flex items-center gap-2 font-mono text-[11px] text-ink-3 hover:text-ink">
          <LogoMark size={14} /> Made with Acta
        </Link>
      </div>
    );
  return <PublicView data={roadmap} />;
}

function Loading() {
  return (
    <div aria-busy className="min-h-dvh bg-page">
      <div className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Skeleton className="size-6" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-10">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-4 h-9 w-72" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <Skeleton className="h-6 w-28" />
              {Array.from({ length: 4 }, (_, j) => (
                <Skeleton key={j} className="h-16" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
