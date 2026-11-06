"use client";

import { Suspense, use, useEffect, useState } from "react";
import { notFound, redirect, useParams } from "next/navigation";
import { dropRead, startReading, takeRead } from "@/lib/board-ahead";
import { boardPath, cachedBoard, forgetBoard } from "@/lib/board-cache";
import { readLive } from "@/lib/board-load";
import { viewShelves } from "@/lib/board-shelves-pref";
import type { LiveBoard, LiveFrame } from "@/lib/live";
import { loadClient } from "@/lib/supabase/browser";
import type { BoardResult } from "@/lib/workspace";
import { BoardApp } from "./board-app";
import { Frame } from "./board-frame";

// The board page. A board this tab has seen shows straight away from the cache, and only what changed since is read
// once it's up. Moving here from another page, the server sends the workspace and the board's own details but not
// its tasks, so a board this tab doesn't hold is read here, starting as soon as the page opens. Only a board seen for
// the first time waits, behind a frame that already has the workspace's sidebar when the workspace is known
export function BoardRoute({ data }: { data: Promise<BoardResult> }) {
  const params = useParams<{ workspace: string; board: string }>();
  const path = boardPath(params.workspace, params.board);
  const [start] = useState(() => cachedBoard(path));
  useEffect(() => {
    if (!start) startReading(params.workspace, params.board);
  }, [start, params.workspace, params.board]);
  return (
    <Suspense fallback={<Frame workspace={params.workspace} board={params.board} />}>
      <Board data={data} start={start} path={path} />
    </Suspense>
  );
}

// One read for each answer, so drawing the page again waits on the same one
const reads = new WeakMap<LiveFrame, Promise<LiveBoard>>();

function readFor(frame: LiveFrame): Promise<LiveBoard> {
  let read = reads.get(frame);
  if (read) return read;
  const path = boardPath(frame.workspace.slug, frame.board.slug);
  read = (takeRead(path) ?? Promise.resolve(null))
    // A read begun from the sidebar's list could have found another board at the address since
    .then(async (got) =>
      got?.board.id === frame.board.id
        ? got
        : readLive(await loadClient(), frame, frame.board.id, viewShelves(frame.board.id)),
    )
    .then(
      // The server's details are newer than whatever the read started from
      (got) => (got ? { ...frame, state: got.state, at: got.at } : whole()),
      whole,
    );
  reads.set(frame, read);
  return read;
}

// When the browser can't read the board itself, the page loads whole and the server draws it
function whole(): Promise<never> {
  location.reload();
  return new Promise(() => {});
}

function Board({ data, start, path }: { data: Promise<BoardResult>; start: LiveBoard | null; path: string }) {
  const [held, setHeld] = useState<LiveBoard | null>(start);
  const [lost, setLost] = useState<BoardResult | null>(null);

  // The first answer is waited for. After that the board stays up and later answers replace it as they arrive,
  // so returning to the page never shows the loading frame again
  const answer = held ? null : use(data);
  const read = answer && "frame" in answer ? use(readFor(answer.frame)) : null;
  if (answer) {
    if ("go" in answer) redirect(answer.go);
    if ("missing" in answer) notFound();
    setHeld("live" in answer ? answer.live : read);
  }

  const holding = held !== null;
  useEffect(() => {
    if (!holding) return;
    // Nothing read ahead is needed once the board is up
    dropRead(path);
    let current = true;
    data.then(
      (result) => {
        if (!current) return;
        if ("live" in result) setHeld(result.live);
        // The board's own details and the workspace around it, for the copy already showing
        else if ("frame" in result) setHeld((now) => (now ? { ...result.frame, state: now.state, at: now.at } : now));
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
  const live = held ?? (answer && "live" in answer ? answer.live : read!);
  return <BoardApp key={live.board.id} variant="full" live={live} />;
}
