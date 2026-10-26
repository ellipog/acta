"use client";

import { useEffect, useRef, useState } from "react";
import type { DemoAction } from "@/components/board-app/demo-state";
import { Visitor } from "@/components/board-app/roadmap-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/display";
import { toast } from "@/components/ui/toast";
import { newId, setBoardMeta, type BoardState, type Suggestion } from "@/lib/board-store";
import {
  publicMeta,
  publicState,
  visitorCookie,
  type PublicResult,
  type PublicRoadmapData,
} from "@/lib/public-roadmap";
import { getBrowserClient } from "@/lib/supabase/client";

function visitorId() {
  const found = document.cookie.match(new RegExp(`(?:^|; )${visitorCookie}=([^;]+)`));
  if (found) return decodeURIComponent(found[1]);
  const id = `v:${newId()}`;
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${visitorCookie}=${encodeURIComponent(id)}; path=/; max-age=34560000; samesite=lax${secure}`;
  return id;
}

const patchTask = (s: BoardState, id: string, votes: number, voted: boolean): BoardState =>
  s.tasks[id] ? { ...s, tasks: { ...s.tasks, [id]: { ...s.tasks[id], votes, voted } } } : s;

const patchSuggestions = (s: BoardState, fn: (list: Suggestion[]) => Suggestion[]): BoardState => ({
  ...s,
  roadmap: { ...s.roadmap, suggestions: fn(s.roadmap.suggestions) },
});

export function PublicView({ data }: { data: PublicRoadmapData }) {
  const [meta, setMeta] = useState(() => publicMeta(data));
  const [state, setState] = useState(() => publicState(data));
  setBoardMeta(meta);
  const lines = useRef(new Map<string, Promise<unknown>>());
  const busy = useRef(0);
  const board = data.board.id;
  const number = (id: string) => Number(id.slice(data.board.prefix.length + 1));

  const queue = (key: string, run: () => Promise<void>) => {
    busy.current++;
    const next = (lines.current.get(key) ?? Promise.resolve()).then(run).finally(() => busy.current--);
    lines.current.set(key, next);
  };

  useEffect(() => {
    let left = 0;
    const back = async () => {
      if (document.visibilityState === "hidden") {
        left = Date.now();
        return;
      }
      if (!left || Date.now() - left < 30_000 || busy.current) return;
      const { data: fresh } = await getBrowserClient().rpc("public_roadmap", {
        p_workspace: data.workspace.slug,
        p_board: data.board.slug,
        p_visitor: visitorId(),
      });
      const r = fresh as PublicResult;
      if (r && !("private" in r) && !busy.current) {
        setMeta(publicMeta(r));
        setState(publicState(r));
      }
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [data.workspace.slug, data.board.slug]);

  const failed = (description = "Check your connection and try again.") =>
    toast({
      icon: "x",
      title: "That didn’t go through",
      description,
      duration: 3200,
    });

  const dispatch = (action: DemoAction) => {
    if (action.type === "vote") {
      const task = state.tasks[action.id];
      if (!task) return;
      const on = !task.voted;
      const before = task.votes ?? 0;
      setState((s) => patchTask(s, action.id, Math.max(0, before + (on ? 1 : -1)), on));
      queue(action.id, async () => {
        const { data: votes, error } = await getBrowserClient().rpc("public_vote", {
          p_board: board,
          p_number: number(action.id),
          p_visitor: visitorId(),
          p_on: on,
        });
        if (error) {
          setState((s) => patchTask(s, action.id, before, !on));
          failed();
        } else setState((s) => (s.tasks[action.id]?.voted === on ? patchTask(s, action.id, votes as number, on) : s));
      });
    }

    if (action.type === "voteSuggestion") {
      const idea = state.roadmap.suggestions.find((x) => x.id === action.id);
      if (!idea) return;
      const on = !idea.voted;
      const set = (votes: number, voted: boolean) => (s: BoardState) =>
        patchSuggestions(s, (list) => list.map((x) => (x.id === action.id ? { ...x, votes, voted } : x)));
      setState(set(Math.max(0, idea.votes + (on ? 1 : -1)), on));
      queue(action.id, async () => {
        const { data: votes, error } = await getBrowserClient().rpc("public_vote_suggestion", {
          p_suggestion: action.id,
          p_visitor: visitorId(),
          p_on: on,
        });
        if (error) {
          setState(set(idea.votes, !on));
          failed();
        } else
          setState((s) =>
            s.roadmap.suggestions.find((x) => x.id === action.id)?.voted === on ? set(votes as number, on)(s) : s,
          );
      });
    }

    if (action.type === "suggest") {
      const id = newId();
      const idea: Suggestion = {
        id,
        title: action.title,
        details: action.details,
        by: "You",
        at: Date.now(),
        votes: 1,
        voted: true,
      };
      setState((s) => patchSuggestions(s, (list) => [idea, ...list]));
      queue(id, async () => {
        const { data: saved, error } = await getBrowserClient().rpc("public_suggest", {
          p_board: board,
          p_id: id,
          p_title: action.title,
          p_details: action.details ?? null,
          p_visitor: visitorId(),
        });
        if (error || !saved) {
          setState((s) => patchSuggestions(s, (list) => list.filter((x) => x.id !== id)));
          failed(
            error?.code === "PT429"
              ? "That’s a lot for one day. Try again tomorrow."
              : "Your note wasn’t saved. Try sending it again.",
          );
        }
      });
    }
  };

  return (
    <div className="min-h-dvh bg-page">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Avatar name={data.workspace.name} sigil={data.workspace.sigil} tone={data.workspace.tone} size="sm" />
          <span className="truncate text-sm font-medium">{data.workspace.name}</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="@container mx-auto max-w-5xl">
        <Visitor state={state} dispatch={dispatch} home="/" />
      </main>
    </div>
  );
}
