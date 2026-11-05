"use client";

import { useParams } from "next/navigation";
import { AppSkeleton } from "@/components/app-chrome";
import { cachedShell, useCounts } from "@/lib/board-cache";

// Apart from the board itself, so pages that only show this while they load don't download the board

/** The loading frame for the address the browser is on, with the workspace's sidebar when this tab has seen it.
 * Reading the address waits while the server prepares the page, so the plain frame shows there instead */
export function BoardFrame() {
  const params = useParams<{ workspace: string; board?: string }>();
  return <Frame workspace={params.workspace} board={params.board} />;
}

export function Frame({ workspace, board }: { workspace: string; board?: string }) {
  const counts = useCounts();
  return <AppSkeleton shell={cachedShell(workspace)} board={board} counts={counts} />;
}
