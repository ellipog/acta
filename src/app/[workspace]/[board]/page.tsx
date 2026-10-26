import type { Metadata } from "next";
import { Suspense } from "react";
import { AppSkeleton } from "@/components/app-chrome";
import { BoardRoute } from "@/components/board-app/board-route";
import { loadBoard, openBoard } from "@/lib/workspace";

export async function generateMetadata({ params }: PageProps<"/[workspace]/[board]">): Promise<Metadata> {
  const { workspace, board } = await params;
  const live = await loadBoard(workspace, board);
  return {
    title: live ? `${live.board.name} · ${live.workspace.name}` : "Acta",
    robots: { index: false, follow: false },
  };
}

// The board is read on the server and handed over as a promise, so the browser can show its own copy of a board
// it has already seen without waiting for this one
export default function BoardPage({ params }: PageProps<"/[workspace]/[board]">) {
  return (
    <Suspense fallback={<AppSkeleton />}>
      <BoardRoute data={params.then(({ workspace, board }) => openBoard(workspace, board))} />
    </Suspense>
  );
}
