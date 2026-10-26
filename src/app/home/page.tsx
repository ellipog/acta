import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSkeleton } from "@/components/app-chrome";
import { getSession, getWorkspaces } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Acta",
  robots: { index: false, follow: false },
};

export default function HomePage() {
  return (
    <Suspense fallback={<AppSkeleton />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const session = await getSession();
  if (!session) redirect("/login?next=/home");
  const workspaces = await getWorkspaces();
  if (!workspaces.length) redirect("/new");
  const [slug] = ((await cookies()).get("acta-last")?.value ?? "").split("/");
  const known = workspaces.find((w) => w.slug === slug);
  // The workspace page picks the last board, and checks it still exists
  return redirect(`/${known ? known.slug : workspaces[0].slug}`);
}
