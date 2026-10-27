"use client";

import Link from "next/link";
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
import { Wordmark } from "@/components/wordmark";
import { useCounts, useMine, type Shell } from "@/lib/board-cache";
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
  return (
    <>
      <div className="flex h-12 shrink-0 items-center border-b border-line px-3">
        <Wordmark href={`/${ws}`} className="[&>span:last-child]:text-base" />
      </div>
      <WorkspaceMenu workspace={shell.workspace} workspaces={shell.workspaces} />
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 text-sm">
        <MyTasksLink shell={shell} active onNavigate={onNavigate} />
        <p className="mt-4 mb-1 px-2 font-mono text-[11px] text-ink-3">Boards</p>
        {shell.boards.map((b) => {
          const n = counts[b.id] ?? b.count;
          return (
            <Link key={b.id} href={`/${ws}/${b.slug}`} onClick={onNavigate} className={navItem(false)}>
              <Icon name="board" size="sm" />
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
