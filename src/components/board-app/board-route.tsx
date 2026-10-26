"use client";

import { Suspense, use, useEffect, useState } from "react";
import { notFound, redirect, useParams } from "next/navigation";
import { AppSkeleton } from "@/components/app-chrome";
import { boardPath, cachedBoard, cachedShell, forgetBoard, useCounts } from "@/lib/board-cache";
import type { LiveBoard } from "@/lib/live";
import type { BoardResult } from "@/lib/workspace";
import { BoardApp } from "./board-app";

// The board page. A board this tab has seen shows straight away from the cache, and the server's copy fills in
// whatever changed when it arrives. Only a board seen for the first time waits, behind a frame that already has
// the workspace's sidebar when the workspace is known
export function BoardRoute({ data }: { data: Promise<BoardResult> }) {
  const params = useParams<{ workspace: string; board: string }>();
  const [start] = useState(() => cachedBoard(boardPath(params.workspace, params.board)));
  return (
    <Suspense fallback={<Frame workspace={params.workspace} board={params.board} />}>
      <Board data={data} start={start} path={boardPath(params.workspace, params.board)} />
    </Suspense>
  );
}

function Frame({ workspace, board }: { workspace: string; board: string }) {
  const counts = useCounts();
  return <AppSkeleton shell={cachedShell(workspace)} board={board} counts={counts} />;
}

function Board({ data, start, path }: { data: Promise<BoardResult>; start: LiveBoard | null; path: string }) {
  const [held, setHeld] = useState<LiveBoard | null>(start);
  const [lost, setLost] = useState<BoardResult | null>(null);

  // The first answer is waited for. After that the board stays up and later answers replace it as they arrive,
  // so returning to the page never shows the loading frame again
  const answer = held ? null : use(data);
  if (answer) {
    if ("go" in answer) redirect(answer.go);
    if ("missing" in answer) notFound();
    setHeld(answer.live);
  }

  const holding = held !== null;
  useEffect(() => {
    if (!holding) return;
    let current = true;
    data.then(
      (result) => {
        if (!current) return;
        if ("live" in result) setHeld(result.live);
        else {
          forgetBoard(path);
          setLost(result);
        }
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [data, holding, path]);

  if (lost && "go" in lost) redirect(lost.go);
  if (lost) notFound();
  const live = held ?? (answer as { live: LiveBoard }).live;
  return <BoardApp key={live.board.id} variant="full" live={live} />;
}
