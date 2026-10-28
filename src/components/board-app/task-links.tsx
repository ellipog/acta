"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { me, type Task } from "@/lib/board-store";
import { listen } from "@/lib/realtime";
import { loadClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

// What GitHub says about a task: its pull requests, issue, branches and commits. Only boards in a workspace that
// connected GitHub have any, and the section stays out of the way until there's something to show

type Link = {
  id: string;
  kind: "pr" | "issue" | "branch" | "commit";
  ref: string;
  url: string;
  title: string | null;
  state: string | null;
  author: string | null;
  closes: boolean;
  extra: { checks?: string; review?: string; branch?: string; draft?: boolean };
};

export const githubOn = Boolean(process.env.NEXT_PUBLIC_GITHUB_APP_SLUG);

const stateTone = { open: "malachite", draft: "stone", merged: "lapis", closed: "hematite" } as const;
const checkTone: Record<string, string> = { success: "bg-malachite", failure: "bg-hematite", timed_out: "bg-hematite" };

function useLinks(board: string | undefined, number: number) {
  const [links, setLinks] = useState<Link[] | null>(null);
  useEffect(() => {
    if (!board || !githubOn) return;
    let live = true;
    const load = async () => {
      const supabase = await loadClient();
      const { data, error } = await supabase
        .from("task_links")
        .select("id, kind, ref, url, title, state, author, closes, extra")
        .eq("board_id", board)
        .eq("number", number)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (live && !error) setLinks(data as Link[]);
    };
    void load();
    const stop = listen(`links:${board}`, [{ table: "task_links", filter: `board_id=eq.${board}` }], {
      change: () => void load(),
      joined: (again) => again && void load(),
    });
    return () => {
      live = false;
      stop();
    };
  }, [board, number]);
  return links;
}

export function TaskLinks({ task }: { task: Task }) {
  const number = Number(task.id.split("-").pop());
  const links = useLinks(me.live ? me.board : undefined, number);
  if (!links?.length) return null;
  const prs = links.filter((l) => l.kind === "pr");
  const issue = links.find((l) => l.kind === "issue");
  const branches = links.filter((l) => l.kind === "branch" && !prs.some((p) => p.extra.branch === l.ref));
  const commits = links.filter((l) => l.kind === "commit");

  return (
    <section className="mt-6">
      <h3 className="text-xs font-medium text-ink-2">Development</h3>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {issue ? (
          <Row icon="github" href={issue.url} title={issue.title ?? `Issue #${issue.ref}`} meta={`#${issue.ref}`}>
            <Badge tone={issue.state === "closed" ? "lapis" : "malachite"}>{issue.state === "closed" ? "Closed" : "Open"}</Badge>
          </Row>
        ) : null}
        {prs.map((p) => (
          <Row
            key={p.id}
            icon="github"
            href={p.url}
            title={p.title ?? `Pull request #${p.ref}`}
            meta={`#${p.ref}${p.author ? ` · ${p.author}` : ""}${p.closes ? " · closes this" : ""}`}
          >
            {p.extra.checks ? (
              <Tooltip content={`Checks: ${p.extra.checks.replace("_", " ")}`}>
                <span className={cn("size-2", checkTone[p.extra.checks] ?? "bg-pyrite")} aria-label={`Checks ${p.extra.checks}`} />
              </Tooltip>
            ) : null}
            {p.extra.review === "approved" ? <Badge tone="malachite">Approved</Badge> : null}
            {p.extra.review === "changes_requested" ? <Badge tone="pyrite">Changes asked</Badge> : null}
            <Badge tone={stateTone[(p.state ?? "open") as keyof typeof stateTone] ?? "stone"}>
              {(p.state ?? "open").replace(/^./, (c) => c.toUpperCase())}
            </Badge>
          </Row>
        ))}
        {branches.map((b) => (
          <Row key={b.id} icon="signpost" href={b.url} title={b.ref} meta="Branch" mono />
        ))}
        {commits.slice(0, 5).map((c) => (
          <Row key={c.id} icon="hash" href={c.url} title={c.title ?? c.ref} meta={c.ref.slice(0, 7)} />
        ))}
      </ul>
      {commits.length > 5 ? (
        <p className="mt-1.5 font-mono text-[11px] text-ink-3">and {commits.length - 5} more commits</p>
      ) : null}
    </section>
  );
}

function Row({
  icon,
  href,
  title,
  meta,
  mono,
  children,
}: {
  icon: "github" | "signpost" | "hash";
  href: string;
  title: string;
  meta: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li>
      <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-1 py-2 hover:bg-sunken">
        <Icon name={icon} size="sm" className="shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm", mono && "font-mono text-xs")}>{title}</span>
          <span className="block truncate font-mono text-[11px] text-ink-3">{meta}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">{children}</span>
      </a>
    </li>
  );
}
