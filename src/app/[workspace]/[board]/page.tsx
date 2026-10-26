import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { AppSkeleton } from "@/components/app-chrome";
import { BoardApp } from "@/components/board-app/board-app";
import { getAuth, getWorkspace, lastBoardIn, loadBoard } from "@/lib/workspace";

export async function generateMetadata({ params }: PageProps<"/[workspace]/[board]">): Promise<Metadata> {
  const { workspace, board } = await params;
  const live = await loadBoard(workspace, board);
  return {
    title: live ? `${live.board.name} · ${live.workspace.name}` : "Acta",
    robots: { index: false, follow: false },
  };
}

export default function BoardPage({ params }: PageProps<"/[workspace]/[board]">) {
  return (
    <Suspense fallback={<AppSkeleton />}>
      <Board params={params} />
    </Suspense>
  );
}

async function Board({ params }: { params: PageProps<"/[workspace]/[board]">["params"] }) {
  const { workspace, board } = await params;
  const live = await loadBoard(workspace, board);
  if (!live) {
    if (!(await getAuth())) redirect(`/login?next=${encodeURIComponent(`/${workspace}/${board}`)}`);
    if (await getWorkspace(workspace)) redirect(`/${workspace}`);
    if (await lastBoardIn(workspace)) redirect("/home?stale");
    notFound();
  }
  return <BoardApp key={live.board.id} variant="full" live={live} />;
}
