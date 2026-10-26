import Link from "next/link";
import { AccountButton } from "@/components/account-button";
import { Wordmark } from "@/components/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, Skeleton } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import type { Shell } from "@/lib/board-cache";
import type { WorkspaceSummary } from "@/lib/live";
import { cn } from "@/lib/utils";

const rows = "flex h-8 items-center gap-2 px-2 text-ink-2";

// `embed` matches the board on the landing page, which is shorter and drops the sidebar sooner. With a `shell`,
// the workspace is already known, so the sidebar and the board's name are real and only the board itself waits
export function AppSkeleton({
  embed,
  shell,
  board,
  counts,
}: {
  embed?: boolean;
  shell?: Shell | null;
  board?: string;
  counts?: Record<string, number>;
}) {
  const current = shell?.boards.find((b) => b.slug === board);
  return (
    <div aria-busy className={cn("flex overflow-hidden bg-page", embed ? "h-[36rem] border border-line-strong" : "h-dvh")}>
      {shell ? (
        <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
          <div className="flex h-12 shrink-0 items-center border-b border-line px-3">
            <Wordmark href={`/${shell.workspace.slug}`} className="[&>span:last-child]:text-base" />
          </div>
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
            <Avatar name={shell.workspace.name} sigil={shell.workspace.sigil} tone={shell.workspace.tone} size="sm" />
            <span className="truncate text-sm font-medium">{shell.workspace.name}</span>
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 text-sm">
            <span className={rows}>
              <Icon name="inbox" size="sm" /> Inbox
            </span>
            <span className={rows}>
              <Icon name="user" size="sm" /> My tasks
            </span>
            <p className="mt-4 mb-1 px-2 font-mono text-[11px] text-ink-3">Boards</p>
            {shell.boards.map((b) => {
              const n = counts?.[b.id] ?? b.count;
              return (
                <Link
                  key={b.id}
                  href={`/${shell.workspace.slug}/${b.slug}`}
                  className={cn(
                    "flex h-8 items-center gap-2 px-2",
                    b.slug === board ? "bg-lapis-soft text-lapis-ink" : "text-ink-2 hover:bg-sunken hover:text-ink",
                  )}
                >
                  <Icon name="board" size="sm" />
                  <span className="truncate">{b.name}</span>
                  {n !== undefined ? <span className="ml-auto font-mono text-[11px] text-ink-3">{n}</span> : null}
                </Link>
              );
            })}
          </nav>
          <div className="shrink-0 border-t border-line p-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-1.5" />
            <div className="mt-3 flex items-center gap-2">
              <AccountButton />
              <span className="truncate text-xs text-ink-2">{shell.me.name}</span>
            </div>
          </div>
        </aside>
      ) : (
        <aside
          className={cn(
            "hidden w-60 shrink-0 flex-col gap-3 border-r border-line bg-surface p-3",
            embed ? "lg:flex" : "md:flex",
          )}
        >
          <Skeleton className="h-6 w-24" />
          <Skeleton className="mt-3 h-8" />
          <div className="mt-4 flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center gap-3 border-b border-line bg-surface px-4">
          {current ? (
            <h2 className="truncate font-display text-lg leading-none">{current.name}</h2>
          ) : (
            <Skeleton className="h-5 w-40" />
          )}
          <Skeleton className="ml-auto h-8 w-28" />
        </div>
        <div className="flex h-11 items-center gap-2 border-b border-line bg-surface px-4">
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="grid flex-1 grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-6 w-24" />
              {Array.from({ length: 4 - (i % 3) }, (_, j) => (
                <Skeleton key={j} className="h-20" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AppTopBar({
  workspace,
  back,
}: {
  workspace?: WorkspaceSummary;
  back?: { href: string; label: string };
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
        <Wordmark href="/home" />
        {workspace ? (
          <>
            <span aria-hidden className="text-line-strong">
              /
            </span>
            <Link href={`/${workspace.slug}`} className="flex min-w-0 items-center gap-2 text-sm hover:text-ink">
              <Avatar name={workspace.name} sigil={workspace.sigil} tone={workspace.tone} size="xs" />
              <span className="truncate">{workspace.name}</span>
            </Link>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          {back ? (
            <Link
              href={back.href}
              className="mr-1 hidden items-center gap-1.5 text-sm text-ink-2 hover:text-ink sm:flex"
            >
              <Icon name="arrow-left" size="sm" /> {back.label}
            </Link>
          ) : null}
          <ThemeToggle />
          <AccountButton />
        </div>
      </div>
    </header>
  );
}
