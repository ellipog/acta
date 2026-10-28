"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { inOrder, useBoardOrder } from "@/lib/account-prefs";
import { boardIcon } from "@/lib/board-icons";
import type { BoardSummary } from "@/lib/live";
import { cn } from "@/lib/utils";

// The waiting sidebar's boards, in the order the real one will show them, so nothing jumps when it arrives
export function SkeletonBoards({
  workspace,
  slug,
  boards,
  board,
  counts,
}: {
  workspace: string;
  slug: string;
  boards: BoardSummary[];
  board?: string;
  counts?: Record<string, number>;
}) {
  return inOrder(boards, useBoardOrder(workspace)).map((b) => {
    const n = counts?.[b.id] ?? b.count;
    return (
      <Link
        key={b.id}
        href={`/${slug}/${b.slug}`}
        className={cn(
          "flex h-8 items-center gap-2 px-2",
          b.slug === board ? "bg-lapis-soft text-lapis-ink" : "text-ink-2 hover:bg-sunken hover:text-ink",
        )}
      >
        <Icon name={boardIcon(b.icon)} size="sm" />
        <span className="truncate">{b.name}</span>
        {n !== undefined ? <span className="ml-auto font-mono text-[11px] text-ink-3">{n}</span> : null}
      </Link>
    );
  });
}
