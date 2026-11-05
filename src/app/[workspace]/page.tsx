import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AppSkeleton, AppTopBar } from "@/components/app-chrome";
import { BoardFrame } from "@/components/board-app/board-frame";
import { getAuth, getWorkspace, lastBoardIn } from "@/lib/workspace";
import { FirstBoard } from "./first-board";

export const metadata: Metadata = {
  title: { absolute: "Acta" },
  robots: { index: false, follow: false },
};

export default function WorkspacePage({ params }: PageProps<"/[workspace]">) {
  return (
    // As on a board: the inner fallback has the sidebar when the browser moves here from a workspace it has seen
    <Suspense fallback={<AppSkeleton />}>
      <Suspense fallback={<BoardFrame />}>
        <Workspace params={params} />
      </Suspense>
    </Suspense>
  );
}

async function Workspace({ params }: { params: PageProps<"/[workspace]">["params"] }) {
  const { workspace: slug } = await params;
  const ws = await getWorkspace(slug);
  if (!ws) {
    if (!(await getAuth())) redirect(`/login?next=${encodeURIComponent(`/${slug}`)}`);
    if (await lastBoardIn(slug)) redirect("/home?stale");
    notFound();
  }
  if (ws.boards.length) {
    const [lastWs, lastBoard] = ((await cookies()).get("acta-last")?.value ?? "").split("/");
    const board = (lastWs === slug && ws.boards.find((b) => b.slug === lastBoard)) || ws.boards[0];
    redirect(`/${slug}/${board.slug}`);
  }
  return (
    <>
      <AppTopBar workspace={ws.workspace} back={{ href: `/${slug}/settings`, label: "Settings" }} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
        <FirstBoard workspace={ws.workspace} />
      </main>
    </>
  );
}
