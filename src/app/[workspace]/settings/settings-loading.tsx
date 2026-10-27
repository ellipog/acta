"use client";

import { useParams } from "next/navigation";
import { AppTopBar } from "@/components/app-chrome";
import { Avatar, Eyebrow, Skeleton } from "@/components/ui/display";
import { cachedShell } from "@/lib/board-cache";

// While settings load, the workspace this tab has already seen keeps its top bar and name on screen

export function SettingsLoading({ cached = false }: { cached?: boolean }) {
  return cached ? <Remembered /> : <Frame />;
}

function Remembered() {
  const { workspace } = useParams<{ workspace: string }>();
  return <Frame shell={cachedShell(workspace)} />;
}

function Frame({ shell }: { shell?: ReturnType<typeof cachedShell> }) {
  const first = shell?.boards[0];
  return (
    <>
      <AppTopBar
        workspace={shell?.workspace}
        back={first ? { href: `/${shell.workspace.slug}/${first.slug}`, label: "Back to boards" } : undefined}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        {shell ? (
          <div className="flex items-center gap-5 pb-10">
            <Avatar
              name={shell.workspace.name}
              sigil={shell.workspace.sigil}
              tone={shell.workspace.tone}
              src={shell.workspace.image}
              size="xl"
            />
            <div className="min-w-0">
              <Eyebrow>Workspace settings</Eyebrow>
              <h1 className="mt-2 truncate font-display text-4xl">{shell.workspace.name}</h1>
            </div>
          </div>
        ) : (
          <Skeleton className="h-10 w-64" />
        )}
        <Skeleton className="mt-10 h-40" />
        <Skeleton className="mt-6 h-64" />
      </main>
    </>
  );
}
