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
  const last = (await cookies()).get("acta-last")?.value ?? "";
  const [slug, board] = last.split("/");
  const known = workspaces.find((w) => w.slug === slug);
  return redirect(known ? `/${known.slug}${board ? `/${board}` : ""}` : `/${workspaces[0].slug}`);
}
