import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { LogoMark } from "@/components/ui/logo-mark";
import { Skeleton } from "@/components/ui/display";
import { Dither } from "@/components/ui/dither";
import { pageFrom } from "@/lib/board-store";
import { JsonLd } from "@/components/json-ld";
import { isPrivate, visitorCookie, type PublicResult, type PublicRoadmapData } from "@/lib/public-roadmap";
import { excerpt, roadmapUrl, shippedOn } from "@/lib/seo";
import { siteUrl } from "@/lib/slugs";
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
  if (!roadmap) return { title: "Roadmap not found", robots: { index: false } };
  if (isPrivate(roadmap)) return { title: roadmap.workspace.name, robots: { index: false } };
  const page = pageFrom(roadmap.board.name, roadmap.board.slug, roadmap.board.page);
  const title = roadmapTitle(page.title, roadmap.workspace.name);
  const description = clip(page.tagline) || roadmapSummary(roadmap);
  const url = roadmapUrl(workspace, board);
  return {
    // The owner's page, under their own name rather than Acta's
    title: { absolute: title },
    description,
    alternates: {
      canonical: url,
      types: page.showShipped ? { "application/rss+xml": `/p/${workspace}/${board}/rss.xml` } : undefined,
    },
    robots: page.hideFromSearch ? { index: false } : undefined,
    openGraph: { title, description, url, type: "website", siteName: roadmap.workspace.name },
  };
}

// "Calcite roadmap", so the page answers a search for one, with the workspace when it adds anything
function roadmapTitle(name: string, workspace: string) {
  const heading = /roadmap/i.test(name) ? name : `${name} roadmap`;
  return name.toLowerCase().includes(workspace.toLowerCase()) ? heading : `${heading} · ${workspace}`;
}

const clip = (text: string, max = 155) =>
  text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : text.trim();

function roadmapSummary(data: PublicRoadmapData) {
  const shipped = data.tasks.filter((t) => t.status === "done").length;
  const planned = data.tasks.filter((t) => t.status !== "done" && t.status !== "canceled").length;
  return `What ${data.workspace.name} is building next and what’s shipped: ${planned} planned, ${shipped} shipped.`;
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
        <Link href={madeWith} className="mt-12 flex items-center gap-2 font-mono text-[11px] text-ink-3 hover:text-ink">
          <LogoMark size={14} /> Made with Acta
        </Link>
      </div>
    );
  const page = pageFrom(roadmap.board.name, roadmap.board.slug, roadmap.board.page);
  return (
    <>
      {page.hideFromSearch ? null : <JsonLd data={roadmapData(roadmap, workspace, board)} />}
      <PublicView data={roadmap} home={madeWith} />
    </>
  );
}

// Every roadmap links back to Acta, marked so the visits show up in analytics
const madeWith = `${siteUrl}/?ref=roadmap`;

// The page and what it has shipped, so search results can show finished work
function roadmapData(data: PublicRoadmapData, workspace: string, board: string) {
  const page = pageFrom(data.board.name, data.board.slug, data.board.page);
  const url = roadmapUrl(workspace, board);
  const shipped = shippedOn(data).slice(0, 50);
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": url,
    url,
    name: roadmapTitle(page.title, data.workspace.name),
    description: page.tagline || undefined,
    about: { "@type": "Organization", name: data.workspace.name },
    isPartOf: { "@type": "WebSite", name: "Acta", url: siteUrl },
    mainEntity: shipped.length
      ? {
          "@type": "ItemList",
          name: page.stageNames.shipped || "Shipped",
          numberOfItems: shipped.length,
          itemListElement: shipped.map((t, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "CreativeWork",
              name: t.title,
              description: excerpt(t.description, 200) || undefined,
              datePublished: t.shipped_on,
            },
          })),
        }
      : undefined,
  };
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
