import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { EmptyState, Skeleton } from "@/components/ui/display";
import { getCurrentUser } from "@/lib/auth";
import { AnalyticsView } from "./analytics-view";
import { loadReport } from "./load";
import { ranges, type RangeId } from "./report";

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
  const range: RangeId = typeof params.range === "string" && params.range in ranges ? (params.range as RangeId) : "7d";
  const dev = params.dev === "1";
  const report = await loadReport(range, dev);

  if (!report)
    return (
      <EmptyState
        art="crystal-shard"
        title="Analytics didn’t load"
        body="The report query failed. Check that the latest Supabase migration has been run."
        className="py-20"
      />
    );

  return <AnalyticsView report={report} range={range} dev={dev} />;
}
