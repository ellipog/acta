"use client";

import { useEffect, useRef, useState } from "react";
import type { DemoAction } from "@/components/board-app/demo-state";
import { Visitor } from "@/components/board-app/roadmap-page";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/display";
import { toast } from "@/components/ui/toast";
import { newId, setBoardMeta, type BoardState, type Suggestion } from "@/lib/board-store";
import {
  isPrivate,
  publicMeta,
  publicState,
  visitorCookie,
  votesIn,
  withOwnVotes,
  type OwnVotes,
  type PublicResult,
  type PublicRoadmapData,
} from "@/lib/public-roadmap";
import { hasSession, loadClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

// The visitor's id, if they've voted or sent an idea here before
function savedVisitor() {
  const found = document.cookie.match(new RegExp(`(?:^|; )${visitorCookie}=([^;]+)`));
  return found ? decodeURIComponent(found[1]) : null;
}

function visitorId() {
  const saved = savedVisitor();
  if (saved) return saved;
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

// A page that keeps to light or dark puts the whole document in it, so dialogs and toasts match. The theme
// provider sets its own choice back on the root when it mounts, so the page holds on to it while it's open
function useForcedTheme(theme: "light" | "dark" | null) {
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    const before = root.getAttribute("data-theme");
    const hold = () => {
      if (root.getAttribute("data-theme") !== theme) root.setAttribute("data-theme", theme);
      root.style.colorScheme = theme;
    };
    hold();
    const watch = new MutationObserver(hold);
    watch.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      watch.disconnect();
      if (before) root.setAttribute("data-theme", before);
      root.style.colorScheme = "";
    };
  }, [theme]);
}

export function PublicView({ data, home }: { data: PublicRoadmapData; home: string }) {
  const [meta, setMeta] = useState(() => publicMeta(data));
  const [state, setState] = useState(() => publicState(data));
  setBoardMeta(meta);
  const page = state.roadmap.page;
  const forced = page.theme === "visitor" ? null : page.theme;
  const width = page.width === "wide" ? "max-w-7xl" : "max-w-5xl";
  useForcedTheme(forced);
  const lines = useRef(new Map<string, Promise<unknown>>());
  const busy = useRef(0);
  // What the visitor has voted on or sent since the page opened, which their saved votes mustn't undo
  const touched = useRef(new Set<string>());
  const board = data.board.id;
  const prefix = data.board.prefix;
  const number = (id: string) => Number(id.slice(prefix.length + 1));

  const queue = (key: string, run: () => Promise<void>) => {
    busy.current++;
    touched.current.add(key);
    const next = (lines.current.get(key) ?? Promise.resolve()).then(run).finally(() => busy.current--);
    lines.current.set(key, next);
  };

  // The page is cached and the same for everyone, so what this visitor voted for comes now. Someone who has never
  // voted or sent an idea here, and isn't signed in, has nothing to fetch
  useEffect(() => {
    const visitor = savedVisitor();
    if (!visitor && !hasSession()) return;
    let open = true;
    (async () => {
      const db = await loadClient();
      const { data: votes, error } = await db.rpc("public_votes", { p_board: board, p_visitor: visitor });
      let own = error ? null : (votes as OwnVotes | null);
      if (error) {
        // Until the database has public_votes, the whole roadmap as this visitor sees it
        const { data: fresh } = await db.rpc("public_roadmap", {
          p_workspace: data.workspace.slug,
          p_board: data.board.slug,
          p_visitor: visitor,
        });
        const r = fresh as PublicResult;
        if (r && !isPrivate(r)) own = votesIn(r);
      }
      const found = own;
      if (open && found) setState((s) => withOwnVotes(s, found, prefix, touched.current));
    })().catch(() => {});
    return () => {
      open = false;
    };
  }, [board, prefix, data.workspace.slug, data.board.slug]);

  useEffect(() => {
    let left = 0;
    const back = async () => {
      if (document.visibilityState === "hidden") {
        left = Date.now();
        return;
      }
      if (!left || Date.now() - left < 30_000 || busy.current) return;
      const { data: fresh } = await (await loadClient()).rpc("public_roadmap", {
        p_workspace: data.workspace.slug,
        p_board: data.board.slug,
        // Only someone who has voted or sent an idea has an id. Looking again doesn't give them one
        p_visitor: savedVisitor(),
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
        const { data: votes, error } = await (await loadClient()).rpc("public_vote", {
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
        const { data: votes, error } = await (await loadClient()).rpc("public_vote_suggestion", {
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
        const { data: saved, error } = await (await loadClient()).rpc("public_suggest", {
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
    <div data-theme={forced ?? undefined} className="min-h-dvh bg-page text-ink">
      <header className="border-b border-line">
        <div className={cn("mx-auto flex h-14 items-center gap-3 px-4 sm:px-6", width)}>
          <Avatar
            name={data.workspace.name}
            sigil={data.workspace.sigil}
            tone={data.workspace.tone}
            src={data.workspace.image}
            size="sm"
          />
          <span className="truncate text-sm font-medium">{data.workspace.name}</span>
          {forced ? null : (
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          )}
        </div>
      </header>
      <main className={cn("@container mx-auto", width)}>
        <Visitor state={state} dispatch={dispatch} home={home} />
      </main>
    </div>
  );
}
