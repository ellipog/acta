"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  availableRepos,
  disconnectGitHub,
  linkRepo,
  unlinkRepo,
  updateRepo,
  type AvailableRepo,
} from "@/lib/github/actions";
import { repoSettings, type RepoSettings } from "@/lib/github/match";

export type GitHubInfo = {
  installations: { id: number; account: string }[];
  repos: { id: number; fullName: string; private: boolean; board: string; settings: unknown }[];
};

const say = (r: { ok: boolean; message: string }) => {
  toast({ icon: r.ok ? "check" : "x", title: r.message, duration: r.ok ? 2400 : 4000 });
};

const setupResults = {
  connected: { ok: true, message: "Connected to GitHub. Now link a repository to a board." },
  cancelled: { ok: false, message: "GitHub wasn’t connected." },
  forbidden: { ok: false, message: "Only someone who manages that GitHub account and this workspace can connect them." },
  taken: { ok: false, message: "That GitHub account is already connected to another workspace." },
  failed: { ok: false, message: "Connecting GitHub didn’t work. Try again." },
};

// Which GitHub accounts the workspace is connected to, and which repository feeds which board
export function GitHubSection({
  workspace,
  slug,
  boards,
  info,
  manager,
}: {
  workspace: string;
  slug: string;
  boards: { id: string; name: string }[];
  info: GitHubInfo;
  manager: boolean;
}) {
  const boardOptions = boards.map((b) => ({ value: b.id, label: b.name }));

  // How coming back from GitHub went
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("github") as keyof typeof setupResults | null;
    if (!result || !setupResults[result]) return;
    say(setupResults[result]);
    url.searchParams.delete("github");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  if (!info.installations.length)
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-ink-2">
          Link repositories to boards. Pull requests, branches and commits that name a task show up on it and move it
          along, and issues can come over as tasks.
        </p>
        {manager ? (
          <Button asChild>
            <a href={`/api/github/install?workspace=${encodeURIComponent(slug)}`}>
              <Icon name="github" /> Connect GitHub
            </a>
          </Button>
        ) : (
          <p className="text-xs text-ink-3">An owner or admin can connect GitHub.</p>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      <ul className="divide-y divide-line border-y border-line">
        {info.installations.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-3">
            <span className="grid size-8 place-items-center border border-line bg-raised text-ink-2">
              <Icon name="github" size="sm" />
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{i.account}</p>
            {manager ? <Disconnect workspace={workspace} installation={i} /> : null}
          </li>
        ))}
      </ul>

      {info.repos.length ? (
        <ul className="flex flex-col gap-3">
          {info.repos.map((r) => (
            <RepoRow key={r.id} workspace={workspace} repo={r} boards={boardOptions} manager={manager} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-2">No repositories linked yet.</p>
      )}

      {manager ? (
        <div className="flex flex-wrap items-center gap-2">
          <AddRepo workspace={workspace} boards={boardOptions} linked={new Set(info.repos.map((r) => r.id))} />
          <Button asChild variant="ghost">
            <a href={`/api/github/install?workspace=${encodeURIComponent(slug)}`}>
              <Icon name="plus" /> Another account or more repositories
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AddRepo({
  workspace,
  boards,
  linked,
}: {
  workspace: string;
  boards: { value: string; label: string }[];
  linked: Set<number>;
}) {
  const [open, setOpen] = useState(false);
  const [repos, setRepos] = useState<AvailableRepo[] | null>(null);
  const [repo, setRepo] = useState<string>();
  const [board, setBoard] = useState<string | undefined>(boards[0]?.value);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    let live = true;
    void availableRepos(workspace).then((list) => live && setRepos(list));
    return () => {
      live = false;
    };
  }, [open, workspace]);

  const options = (repos ?? [])
    .filter((r) => !linked.has(r.id))
    .map((r) => ({ value: String(r.id), label: r.fullName, hint: r.private ? "private" : undefined }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Icon name="link" /> Link a repository
        </Button>
      </DialogTrigger>
      <DialogContent title="Link a repository" description="Its pull requests and branches show up on this board’s tasks.">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs text-ink-2">
            Repository
            <Select
              value={repo}
              onValueChange={setRepo}
              options={options}
              disabled={!repos}
              placeholder={!repos ? "Loading…" : options.length ? "Choose…" : "Nothing left to link"}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-ink-2">
            Board
            <Select value={board} onValueChange={setBoard} options={boards} />
          </label>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="primary"
              disabled={!repo || !board || pending}
              onClick={() =>
                start(async () => {
                  const r = await linkRepo(workspace, Number(repo), board!);
                  say(r);
                  if (r.ok) {
                    setOpen(false);
                    setRepo(undefined);
                  }
                })
              }
            >
              Link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RepoRow({
  workspace,
  repo,
  boards,
  manager,
}: {
  workspace: string;
  repo: GitHubInfo["repos"][number];
  boards: { value: string; label: string }[];
  manager: boolean;
}) {
  const [settings, setSettings] = useState(() => repoSettings(repo.settings));
  const [board, setBoard] = useState(repo.board);
  const [label, setLabel] = useState(settings.issueLabel ?? "");
  const [, start] = useTransition();

  const save = (next: RepoSettings) => {
    const before = settings;
    setSettings(next);
    start(async () => {
      const r = await updateRepo(workspace, repo.id, { settings: next });
      if (!r.ok) setSettings(before);
      if (!r.ok || r.message !== "Saved.") say(r);
    });
  };
  const toggle = (label: string, on: boolean, set: (on: boolean) => RepoSettings, hint?: string) => (
    <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0">
        {label}
        {hint ? <span className="block text-xs text-ink-3">{hint}</span> : null}
      </span>
      <Switch checked={on} disabled={!manager} onCheckedChange={(v) => save(set(v))} />
    </label>
  );
  const a = settings.automation;

  return (
    <li className="border border-line bg-raised">
      <div className="flex items-center gap-3 border-b border-line px-3 py-2.5">
        <Icon name={repo.private ? "lock" : "globe"} size="sm" className="text-ink-3" />
        <a
          href={`https://github.com/${repo.fullName}`}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 truncate text-sm font-medium hover:text-lapis"
        >
          {repo.fullName}
        </a>
        <Select
          variant="compact"
          className="w-40"
          aria-label="Board"
          value={board}
          disabled={!manager}
          options={boards}
          onValueChange={(next) => {
            const before = board;
            setBoard(next);
            start(async () => {
              const r = await updateRepo(workspace, repo.id, { board: next });
              if (!r.ok) setBoard(before);
              say(r);
            });
          }}
        />
        {manager ? (
          <button
            aria-label={`Unlink ${repo.fullName}`}
            onClick={() => start(async () => say(await unlinkRepo(workspace, repo.id)))}
            className="grid size-7 place-items-center text-ink-3 hover:bg-hematite-soft hover:text-hematite"
          >
            <Icon name="x" size="sm" />
          </button>
        ) : null}
      </div>
      <div className="grid gap-x-6 px-3 py-2 sm:grid-cols-2">
        {toggle("Start on a branch or commit", a.start, (v) => ({ ...settings, automation: { ...a, start: v } }))}
        {toggle("Review when a pull request opens", a.review, (v) => ({ ...settings, automation: { ...a, review: v } }))}
        {toggle("Done when it merges", a.done, (v) => ({ ...settings, automation: { ...a, done: v } }))}
        {toggle("Comment on pull requests", settings.comment, (v) => ({ ...settings, comment: v }))}
        {toggle(
          "Sync issues",
          settings.issues,
          (v) => ({ ...settings, issues: v }),
          "Issues become tasks, and title, status and labels stay in step",
        )}
        {settings.issues ? (
          <label className="flex items-center gap-2 py-1.5 text-sm">
            <span className="shrink-0">Only labelled</span>
            <Input
              value={label}
              disabled={!manager}
              placeholder="Any label"
              maxLength={50}
              className="h-7 text-xs"
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => {
                if (label.trim() !== (settings.issueLabel ?? "")) save({ ...settings, issueLabel: label.trim() || undefined });
              }}
            />
          </label>
        ) : null}
      </div>
    </li>
  );
}

function Disconnect({ workspace, installation }: { workspace: string; installation: { id: number; account: string } }) {
  const [pending, start] = useTransition();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost">Disconnect</Button>
      </DialogTrigger>
      <DialogContent
        title={`Disconnect ${installation.account}?`}
        description="The Acta app is removed from this GitHub account, and its repositories stop linking to tasks. Tasks keep everything else."
      >
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => start(async () => say(await disconnectGitHub(workspace, installation.id)))}
          >
            Disconnect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
