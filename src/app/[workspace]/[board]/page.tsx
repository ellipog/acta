import type { Metadata } from "next";
import { Suspense } from "react";
import { AppSkeleton } from "@/components/app-chrome";
import { BoardFrame } from "@/components/board-app/board-frame";
import { BoardRoute } from "@/components/board-app/board-route";
import { loadBoard, openBoard } from "@/lib/workspace";

export async function generateMetadata({ params }: PageProps<"/[workspace]/[board]">): Promise<Metadata> {
  const { workspace, board } = await params;
  const live = await loadBoard(workspace, board);
  return {
    title: { absolute: live ? `${live.board.name} · ${live.workspace.name}` : "Acta" },
    robots: { index: false, follow: false },
  };
}

// The board is read on the server and handed over as a promise, so the browser can show its own copy of a board
// it has already seen without waiting for this one. The inner fallback reads the address, which only the browser
// knows when it moves here, so moving between boards keeps the sidebar. The outer one is what the page starts as
export default function BoardPage({ params }: PageProps<"/[workspace]/[board]">) {
  return (
    <Suspense fallback={<AppSkeleton />}>
      <Suspense fallback={<BoardFrame />}>
        <BoardRoute data={params.then(({ workspace, board }) => openBoard(workspace, board))} />
      </Suspense>
    </Suspense>
  );
}
