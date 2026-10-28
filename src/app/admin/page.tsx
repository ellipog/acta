import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { EmptyState, Skeleton } from "@/components/ui/display";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/display";
import { cn } from "@/lib/utils";
import { AnalyticsView } from "./analytics-view";
import { loadOwnerReport, loadReport } from "./load";
import { OverviewView } from "./overview-view";
import { ownerRanges, ranges, type OwnerRangeId, type RangeId } from "./report";

export const metadata: Metadata = {
  title: "Analytics · Acta",
  robots: { index: false, follow: false },
};

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function AdminPage({ searchParams }: { searchParams: Params }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <Suspense
          fallback={
            <div className="flex flex-col gap-6">
              <Skeleton className="h-10 w-56" />
              <div className="grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-6">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
              <Skeleton className="h-72" />
            </div>
          }
        >
          <Dashboard searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Dashboard({ searchParams }: { searchParams: Params }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!user.admin) notFound();

  const params = await searchParams;
  const traffic = params.tab === "traffic";
  const asked = typeof params.range === "string" ? params.range : "";

  if (!traffic) {
    const range: OwnerRangeId = asked in ownerRanges ? (asked as OwnerRangeId) : "30d";
    // Everyone counts, admins too, unless asked to leave them out
    const me = params.me !== "0";
    const report = await loadOwnerReport(range, me);
    return (
      <Shell traffic={false}>
        {report ? (
          <OverviewView report={report} range={range} me={me} />
        ) : (
          <EmptyState
            art="crystal-shard"
            title="The overview didn’t load"
            body="Its query failed. Check that the latest Supabase migration has been run."
            className="py-20"
          />
        )}
      </Shell>
    );
  }

  const range: RangeId = asked in ranges ? (asked as RangeId) : "7d";
  const dev = params.dev === "1";
  const report = await loadReport(range, dev);

  return (
    <Shell traffic>
      {report ? (
        <AnalyticsView report={report} range={range} dev={dev} />
      ) : (
        <EmptyState
          art="crystal-shard"
          title="Analytics didn’t load"
          body="The report query failed. Check that the latest Supabase migration has been run."
          className="py-20"
        />
      )}
    </Shell>
  );
}

function Shell({ traffic, children }: { traffic: boolean; children: React.ReactNode }) {
  const tab = (on: boolean) =>
    cn("h-9 border-b-2 px-1 text-sm", on ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink");
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Eyebrow>Admin</Eyebrow>
        <h1 className="mt-2 font-display text-4xl">{traffic ? "Site traffic" : "Overview"}</h1>
        <nav aria-label="Admin" className="mt-5 flex gap-5 border-b border-line">
          <Link href="/admin" aria-current={traffic ? undefined : "page"} className={tab(!traffic)}>
            Overview
          </Link>
          <Link href="/admin?tab=traffic" aria-current={traffic ? "page" : undefined} className={tab(traffic)}>
            Site traffic
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
