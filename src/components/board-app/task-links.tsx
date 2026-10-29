"use client";

import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { me, type Task } from "@/lib/board-store";
import { linkToTask, openIssueFromTask, unlinkFromTask } from "@/lib/github/actions";
import { repoSettings } from "@/lib/github/match";
import { listen } from "@/lib/realtime";
import { loadClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

// What GitHub says about a task: its pull requests, issue, branches and commits. Only boards in a workspace that
// connected GitHub have any. With a repository linked, people who may edit can link work by its address and open
// an issue from the task

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

type Repo = { fullName: string; issues: boolean };

export const githubOn = Boolean(process.env.NEXT_PUBLIC_GITHUB_APP_SLUG);

const stateTone = { open: "malachite", draft: "stone", merged: "lapis", closed: "hematite" } as const;
const checkTone: Record<string, string> = { success: "bg-malachite", failure: "bg-hematite", timed_out: "bg-hematite" };

function useGitHub(board: string | undefined, number: number) {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
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
    void (async () => {
      const supabase = await loadClient();
      const { data } = await supabase.from("github_repos").select("full_name, settings").eq("board_id", board).order("full_name");
      if (live && data)
        setRepos(data.map((r) => ({ fullName: r.full_name as string, issues: repoSettings(r.settings).issues })));
    })();
    const stop = listen(`links:${board}`, [{ table: "task_links", filter: `board_id=eq.${board}` }], {
      change: () => void load(),
      joined: (again) => again && void load(),
    });
    return () => {
      live = false;
      stop();
    };
  }, [board, number]);
  return { links, repos };
}

export function TaskLinks({ task, canEdit = true }: { task: Task; canEdit?: boolean }) {
  const number = Number(task.id.split("-").pop());
  const board = me.live ? me.board : undefined;
  const { links, repos } = useGitHub(board, number);
  const [busy, start] = useTransition();
  const [draft, setDraft] = useState("");
  const editing = canEdit && repos.length > 0;
  if (!board || (!links?.length && !editing)) return null;

  const all = links ?? [];
  const prs = all.filter((l) => l.kind === "pr");
  const issue = all.find((l) => l.kind === "issue");
  const branches = all.filter((l) => l.kind === "branch" && !prs.some((p) => p.extra.branch === l.ref));
  const commits = all.filter((l) => l.kind === "commit");
  const issueRepos = repos.filter((r) => r.issues);

  const act = (run: () => Promise<{ ok: boolean; message: string; url?: string }>, then?: () => void) =>
    start(async () => {
      const result = await run();
      toast({ icon: result.ok ? "github" : "x", title: result.message, duration: result.ok ? 2200 : 4000 });
      if (result.ok) then?.();
    });
  const unlink = editing ? (id: string) => act(() => unlinkFromTask(board, number, id)) : undefined;

  return (
    <section className="mt-6">
      <h3 className="text-xs font-medium text-ink-2">Development</h3>
      {all.length ? (
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {issue ? (
            <Row
              icon="github"
              href={issue.url}
              title={issue.title ?? `Issue #${issue.ref}`}
              meta={`#${issue.ref} · syncs with this task`}
              onUnlink={unlink && (() => unlink(issue.id))}
            >
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
              onUnlink={unlink && (() => unlink(p.id))}
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
            <Row key={b.id} icon="signpost" href={b.url} title={b.ref} meta="Branch" mono onUnlink={unlink && (() => unlink(b.id))} />
          ))}
          {commits.slice(0, 5).map((c) => (
            <Row
              key={c.id}
              icon="hash"
              href={c.url}
              title={c.title ?? c.ref}
              meta={c.ref.slice(0, 7)}
              onUnlink={unlink && (() => unlink(c.id))}
            />
          ))}
        </ul>
      ) : null}
      {commits.length > 5 ? (
        <p className="mt-1.5 font-mono text-[11px] text-ink-3">and {commits.length - 5} more commits</p>
      ) : null}
      {editing ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const url = draft.trim();
              if (url) act(() => linkToTask(board, number, url), () => setDraft(""));
            }}
            className="flex min-w-60 flex-1 items-center gap-2.5 px-1"
          >
            <Icon name="link" className="text-ink-3" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
              placeholder="Paste a pull request, issue, branch or commit link"
              aria-label="Link GitHub work"
              className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
            />
          </form>
          {!issue
            ? issueRepos.map((r) => (
                <button
                  key={r.fullName}
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => openIssueFromTask(board, number, r.fullName))}
                  className="flex h-8 items-center gap-1.5 px-1 text-xs text-ink-3 hover:text-ink disabled:opacity-50"
                >
                  <Icon name="plus" size="sm" />
                  Open issue{issueRepos.length > 1 ? ` in ${r.fullName.split("/")[1]}` : ""}
                </button>
              ))
            : null}
        </div>
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
  onUnlink,
  children,
}: {
  icon: "github" | "signpost" | "hash";
  href: string;
  title: string;
  meta: string;
  mono?: boolean;
  onUnlink?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <li className="group flex items-center">
      <a href={href} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2.5 px-1 py-2 hover:bg-sunken">
        <Icon name={icon} size="sm" className="shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm", mono && "font-mono text-xs")}>{title}</span>
          <span className="block truncate font-mono text-[11px] text-ink-3">{meta}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">{children}</span>
      </a>
      {onUnlink ? (
        <Tooltip content="Unlink">
          <button
            type="button"
            aria-label={`Unlink ${title}`}
            onClick={onUnlink}
            className="grid size-7 shrink-0 place-items-center text-ink-3 opacity-0 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
          >
            <Icon name="x" size="sm" />
          </button>
        </Tooltip>
      ) : null}
    </li>
  );
}
