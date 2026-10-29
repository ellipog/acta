import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
import { Dither } from "@/components/ui/dither";
import { Skeleton } from "@/components/ui/display";
import { getSession, getWorkspaces } from "@/lib/workspace";
import { NewWorkspaceForm } from "./new-workspace-form";

export const metadata: Metadata = {
  title: "New workspace",
  robots: { index: false, follow: false },
};

export default function NewWorkspacePage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]">
      <aside className="relative hidden overflow-hidden border-r border-ink bg-sunken lg:block">
        <Dither name="karli-hall" tone="ink" fill className="opacity-80" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-sunken via-sunken/80 to-transparent px-10 pt-24 pb-10">
          <p className="font-display text-4xl leading-tight">Every team starts with a single layer.</p>
          <p className="mt-3 max-w-sm text-sm text-ink-2">
            A workspace holds your boards and the people you work with. Invite them once it’s set up.
          </p>
        </div>
      </aside>
      <main className="flex flex-col px-5 py-6 sm:px-10">
        <Suspense fallback={<Shell />}>
          <Content />
        </Suspense>
      </main>
    </div>
  );
}

function Shell() {
  return (
    <>
      <Wordmark href="/home" />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 py-16">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
    </>
  );
}

async function Content() {
  const [session, workspaces] = await Promise.all([getSession(), getWorkspaces()]);
  if (!session) redirect("/login?next=/new");
  return (
    <>
      <div className="flex items-center justify-between">
        <Wordmark href="/home" />
        {workspaces.length ? (
          <Link href="/home" className="text-sm text-ink-3 hover:text-ink">
            Back to your boards
          </Link>
        ) : null}
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
        <NewWorkspaceForm first={!workspaces.length} name={session.me.name} />
      </div>
    </>
  );
}
