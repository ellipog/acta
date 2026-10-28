"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountButton } from "@/components/account-button";
import { ThemeControls } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/display";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icons";
import { PixelCaret } from "@/components/ui/pixel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Wordmark } from "@/components/wordmark";
import { inOrder, syncPrefs, useBoardOrder } from "@/lib/account-prefs";
import { boardIcon } from "@/lib/board-icons";
import { useCounts, useMine, type Shell } from "@/lib/board-cache";
import { timeAgo } from "@/lib/board-store";
import { useNow } from "@/lib/hooks";
import { loadClient } from "@/lib/supabase/browser";
import type { WorkspaceSummary } from "@/lib/live";
import { cn } from "@/lib/utils";

// The sidebar's frame for pages that aren't a board: the workspace, My tasks and the boards

export const navItem = (active: boolean) =>
  cn(
    "flex h-8 w-full items-center gap-2 px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-lapis",
    active ? "bg-lapis-soft text-lapis-ink" : "text-ink-2 hover:bg-sunken hover:text-ink",
  );

/** The workspace's name at the top of the sidebar, opening a switcher */
export function WorkspaceMenu({
  workspace,
  workspaces,
}: {
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 text-left outline-none hover:bg-sunken focus-visible:bg-sunken">
        <Avatar name={workspace.name} sigil={workspace.sigil} tone={workspace.tone} src={workspace.image} size="sm" />
        <span className="truncate text-sm font-medium">{workspace.name}</span>
        <PixelCaret className="ml-auto text-ink-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} asChild>
            <Link href={`/${w.slug}`}>
              <Avatar name={w.name} sigil={w.sigil} tone={w.tone} src={w.image} size="xs" />
              <span className="truncate">{w.name}</span>
              {w.id === workspace.id ? <Icon name="check" className="ml-auto text-lapis" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/${workspace.slug}/settings`}>
            <Icon name="settings" /> Settings and members
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/new">
            <Icon name="plus" /> New workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** My tasks in the sidebar, with how many of yours are open across the workspace */
export function MyTasksLink({
  shell,
  active,
  className,
  onNavigate,
}: {
  shell: Pick<Shell, "workspace" | "boards">;
  active: boolean;
  className?: string;
  onNavigate?: () => void;
}) {
  const mine = useMine(shell.boards);
  return (
    <Link
      href={`/${shell.workspace.slug}/my-tasks`}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(navItem(active), className)}
    >
      <Icon name="user" size="sm" />
      My tasks
      {mine ? <span className="ml-auto font-mono text-[11px] text-ink-3 tabular-nums">{mine}</span> : null}
    </Link>
  );
}

export function WorkspaceNav({ shell, onNavigate }: { shell: Shell; onNavigate?: () => void }) {
  const counts = useCounts();
  const ws = shell.workspace.slug;
  const boards = inOrder(shell.boards, useBoardOrder(shell.workspace.id));
  const meId = shell.me.id;
  useEffect(() => syncPrefs(meId), [meId]);
  return (
    <>
      <div className="flex h-12 shrink-0 items-center border-b border-line px-3">
        <Wordmark href={`/${ws}`} className="[&>span:last-child]:text-base" />
      </div>
      <WorkspaceMenu workspace={shell.workspace} workspaces={shell.workspaces} />
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 text-sm">
        <WorkspaceInbox shell={shell} />
        <MyTasksLink shell={shell} active onNavigate={onNavigate} />
        <p className="mt-4 mb-1 px-2 font-mono text-[11px] text-ink-3">Boards</p>
        {boards.map((b) => {
          const n = counts[b.id] ?? b.count;
          return (
            <Link key={b.id} href={`/${ws}/${b.slug}`} onClick={onNavigate} className={navItem(false)}>
              <Icon name={boardIcon(b.icon)} size="sm" />
              <span className="truncate">{b.name}</span>
              {n !== undefined ? (
                <span className="ml-auto font-mono text-[11px] text-ink-3 tabular-nums">{n}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="flex shrink-0 items-center justify-between border-t border-line p-3">
        <span className="flex min-w-0 items-center gap-2">
          <AccountButton />
          <span className="truncate text-xs text-ink-2">{shell.me.name}</span>
        </span>
        <ThemeControls side="top" />
      </div>
    </>
  );
}

type Happening = { key: string; who: string; via?: string; text: string; at: number; id: string; title: string; href: string };

/** The Inbox away from a board: the latest from your team across every board in the workspace */
function WorkspaceInbox({ shell }: { shell: Shell }) {
  const now = useNow();
  const [loaded, setFeed] = useState<Happening[] | null>(null);
  const [seen, setSeen] = useState(0);
  const ws = shell.workspace.slug;
  const ids = shell.boards.map((b) => b.id).join(",");
  const meId = shell.me.id;

  useEffect(() => {
    if (!ids) return;
    let stale = false;
    void loadClient().then(async (supabase) => {
      const { data } = await supabase
        .from("activity")
        .select("id, number, text, actor, via, created_at, board_id, tasks!inner(title, deleted_at, boards!inner(slug, prefix))")
        .in("board_id", ids.split(","))
        .is("tasks.deleted_at", null)
        .neq("actor", meId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (stale) return;
      const names = new Map(shell.members.map((m) => [m.id, m.name]));
      setFeed(
        (data ?? []).map((a) => {
          const task = a.tasks as unknown as { title: string; boards: { slug: string; prefix: string } };
          const id = `${task.boards.prefix}-${a.number}`;
          return {
            key: a.id,
            who: (a.actor && names.get(a.actor)) || "Someone",
            via: a.via ?? undefined,
            text: a.text,
            at: Date.parse(a.created_at),
            id,
            title: task.title,
            href: `/${ws}/${task.boards.slug}#${id}`,
          };
        }),
      );
    });
    return () => {
      stale = true;
    };
  }, [ids, meId, ws, shell.members]);

  // A workspace without boards has nothing to read
  const feed = ids ? loaded : [];
  const unread = now && feed ? feed.filter((a) => a.at > seen && now - a.at < 2 * 86_400_000).length : 0;
  return (
    <Popover onOpenChange={(open) => !open && now && setSeen(now)}>
      <PopoverTrigger className={navItem(false)}>
        <Icon name="inbox" size="sm" />
        Inbox
        {unread ? (
          <span className="ml-auto grid h-4 min-w-4 place-items-center bg-lapis px-1 font-mono text-[10px] text-on-accent">
            {unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-80">
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <span className="text-sm font-medium">Inbox</span>
          <span className="font-mono text-[11px] text-ink-3">Latest across {shell.workspace.name}</span>
        </div>
        <ol className="max-h-96 overflow-y-auto py-1">
          {feed === null ? (
            <li className="px-3 py-2 text-xs text-ink-3">Reading the latest…</li>
          ) : !feed.length ? (
            <li className="px-3 py-2 text-xs text-ink-3">Nothing from your team yet.</li>
          ) : (
            feed.map((a) => {
              const person = shell.members.find((m) => m.name === a.who);
              const fresh = now !== null && a.at > seen && now - a.at < 2 * 86_400_000;
              return (
                <li key={a.key}>
                  <Link
                    href={a.href}
                    className="flex w-full items-start gap-2.5 px-3 py-2 text-left outline-none hover:bg-sunken focus-visible:bg-sunken"
                  >
                    {person ? (
                      <Avatar name={person.name} src={person.avatar} tone={person.tone} size="sm" />
                    ) : (
                      <span className="size-6 shrink-0 border border-dashed border-line-strong" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-ink-2">
                        <span className="font-medium text-ink">{a.who}</span>
                        {a.via ? <span className="text-ink-3"> via {a.via}</span> : null} {a.text}
                      </span>
                      <span className="mt-0.5 block truncate text-xs">
                        <span className="font-mono text-[11px] text-ink-3">{a.id}</span> {a.title}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="font-mono text-[10px] text-ink-3">{now ? timeAgo(a.at, now) : ""}</span>
                      {fresh ? <span className="size-1.5 bg-lapis" aria-label="Unread" /> : null}
                    </span>
                  </Link>
                </li>
              );
            })
          )}
        </ol>
      </PopoverContent>
    </Popover>
  );
}
