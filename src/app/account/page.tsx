import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Skeleton } from "@/components/ui/display";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaces } from "@/lib/workspace";
import { AccountView } from "./account-view";
import type { AgentKey } from "./agent-keys";

export const metadata: Metadata = {
  title: "Account · Acta",
};

export default function AccountPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <Suspense
          fallback={
            <div className="flex flex-col gap-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-10 w-64" />
              <Skeleton className="mt-8 h-48 w-full" />
            </div>
          }
        >
          <Account />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Account() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const supabase = await createClient();
  const [{ data: keys }, workspaces] = await Promise.all([
    supabase
      .from("agent_keys")
      .select("id, name, access, workspaces, hint, created_at, used_at")
      .order("created_at", { ascending: false }),
    getWorkspaces(),
  ]);
  return (
    <AccountView
      user={user}
      keys={(keys ?? []) as AgentKey[]}
      workspaces={workspaces.map((w) => ({ id: w.id, slug: w.slug, name: w.name }))}
    />
  );
}
