import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Skeleton } from "@/components/ui/display";
import { getCurrentUser } from "@/lib/auth";
import { AccountView } from "./account-view";

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
  return <AccountView user={user} />;
}
