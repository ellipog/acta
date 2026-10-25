import Link from "next/link";
import { AccountButton } from "@/components/account-button";
import { Wordmark } from "@/components/site-chrome";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, Skeleton } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import type { WorkspaceSummary } from "@/lib/live";

export function AppSkeleton() {
  return (
    <div aria-busy className="flex h-dvh overflow-hidden bg-page">
      <aside className="hidden w-60 shrink-0 flex-col gap-3 border-r border-line bg-surface p-3 md:flex">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mt-3 h-8" />
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-6" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center gap-3 border-b border-line bg-surface px-4">
          <Skeleton className="h-5 w-40" />
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
