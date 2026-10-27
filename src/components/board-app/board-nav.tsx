"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog as D } from "radix-ui";
import { BoardEditor, DeleteBoardDialog } from "@/components/board-editor";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { DialogContent } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/display";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { addBoard, removeBoard, saveBoard } from "@/lib/board-actions";
import { boardPath, cachedBoard, useCounts } from "@/lib/board-cache";
import { useBoardEdits } from "@/lib/board-edits";
import { can, isManager, type BoardSummary, type LiveBoard } from "@/lib/live";
import { publicHref } from "@/lib/slugs";
import { cn } from "@/lib/utils";

// The boards in the sidebar. Right-click one, long-press it or use its ⋯ button for its menu

type Kit = "context" | "dropdown";

function BoardMenuItems({
  kit,
  board,
  href,
  roadmap,
  settings,
  canDelete,
  onEdit,
  onDelete,
}: {
  kit: Kit;
  board: BoardSummary;
  href: string;
  roadmap?: string;
  settings: string;
  canDelete: boolean;
  onEdit?: () => void;
  onDelete: () => void;
}) {
  const Item = kit === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator = kit === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const Label = kit === "context" ? ContextMenuLabel : DropdownMenuLabel;
  const router = useRouter();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(new URL(href, location.origin).href);
      toast({ icon: "link", title: "Link copied", description: board.name, duration: 2000 });
    } catch {
      toast({ icon: "x", title: "Couldn’t copy the link" });
    }
  };
  return (
    <>
      <Label className="truncate">{board.name}</Label>
      <Item onSelect={() => window.open(href, "_blank", "noopener")}>
        <Icon name="external" /> Open in a new tab
      </Item>
      <Item onSelect={() => void copy()}>
        <Icon name="link" /> Copy link
      </Item>
      <Separator />
      {onEdit ? (
        <Item onSelect={onEdit}>
          <Icon name="pencil" /> Edit board…
        </Item>
      ) : null}
      {roadmap ? (
        <Item onSelect={() => window.open(roadmap, "_blank", "noopener")}>
          <Icon name="globe" /> Public roadmap
        </Item>
      ) : null}
      <Item onSelect={() => router.push(settings)}>
        <Icon name="settings" /> Workspace settings
      </Item>
      {canDelete ? (
        <>
          <Separator />
          <Item danger onSelect={onDelete}>
            <Icon name="trash" /> Delete board…
          </Item>
        </>
      ) : null}
    </>
  );
}

export function BoardLinks({
  live,
  total,
  active,
  isPublic,
  item,
  onNavigate,
  keep,
}: {
  live: LiveBoard;
  total: number;
  // Whether the open board is the highlighted row, rather than a filter such as My tasks
  active: boolean;
  isPublic: boolean;
  item: (active: boolean) => string;
  onNavigate: () => void;
  // Keeps the open board in the cache, so a new address shows it straight away
  keep: () => void;
}) {
  const router = useRouter();
  const counts = useCounts();
  const { adding } = useBoardEdits();
  const [editing, setEditing] = useState<BoardSummary | null>(null);
  const [deleting, setDeleting] = useState<BoardSummary | null>(null);
  const ws = live.workspace.slug;
  const settings = `/${ws}/settings`;
  const canDelete = isManager(live.workspace.role);
  const canChange = can(live.workspace.role, live.workspace.permissions, "boards");

  const editable = (b: BoardSummary) => {
    if (b.id === live.board.id) return live.board;
    const cached = cachedBoard(boardPath(ws, b.slug))?.board;
    return { id: b.id, slug: b.slug, name: b.name, labels: cached?.labels, projects: cached?.projects };
  };

  return (
    <>
      {live.boards.map((b) => {
        const current = b.id === live.board.id;
        const href = `/${ws}/${b.slug}`;
        const count = current ? total : (counts[b.id] ?? b.count);
        const menu = {
          board: b,
          href,
          roadmap: current && isPublic ? publicHref(ws, b.slug) : undefined,
          settings,
          canDelete,
          onEdit: canChange ? () => setEditing(b) : undefined,
          onDelete: () => setDeleting(b),
        };
        // The count stays put and steps aside for the ⋯ button while it shows
        const room = "group-focus-within/board:pr-8 group-hover/board:pr-8 group-has-data-[state=open]/board:pr-8";
        const inner = (
          <>
            <Icon name="board" size="sm" />
            <span className="truncate">{b.name}</span>
            {count !== undefined ? (
              <span className="ml-auto font-mono text-[11px] text-ink-3 tabular-nums">
                {count}
              </span>
            ) : null}
          </>
        );
        return (
          <ContextMenu key={b.id}>
            <ContextMenuTrigger asChild>
              <div className="group/board relative">
                {current ? (
                  <button className={cn(item(active), room)} onClick={onNavigate} aria-current="page">
                    {inner}
                  </button>
                ) : (
                  <Link href={href} className={cn(item(false), room)} onClick={onNavigate}>
                    {inner}
                  </Link>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`More for ${b.name}`}
                    className="absolute top-1 right-1 grid size-6 place-items-center text-ink-3 opacity-0 outline-none group-focus-within/board:opacity-100 group-hover/board:opacity-100 hover:bg-line hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-lapis data-[state=open]:bg-line data-[state=open]:opacity-100"
                  >
                    <Icon name="dots" size="sm" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="right" className="w-56">
                    <BoardMenuItems kit="dropdown" {...menu} />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              <BoardMenuItems kit="context" {...menu} />
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
      {adding
        .filter((a) => a.workspace === live.workspace.id)
        .map((a) => (
          <span key={a.key} className={cn(item(false), "text-ink-3")} aria-busy="true">
            <Icon name="board" size="sm" />
            <span className="truncate">{a.name}</span>
            <Spinner label="Creating the board" className="ml-auto" />
          </span>
        ))}

      {editing ? (
        <BoardEditor
          board={editable(editing)}
          workspace={ws}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onSave={(change) =>
            void saveBoard(editing, change, { workspace: ws, current: editing.id === live.board.id, router, keep })
          }
        />
      ) : null}
      {deleting ? (
        <DeleteBoardDialog
          board={deleting}
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          onDelete={() => {
            const next = live.boards.find((b) => b.id !== deleting.id)?.slug ?? null;
            void removeBoard(deleting, { workspace: ws, current: deleting.id === live.board.id, next, router });
          }}
        />
      ) : null}
    </>
  );
}

export function NewBoard({ live }: { live: LiveBoard }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <D.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setName("");
      }}
    >
      <Tooltip content="New board" side="right">
        <D.Trigger
          aria-label="New board"
          className="grid size-5 place-items-center text-ink-3 outline-none hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-lapis"
        >
          <Icon name="plus" size="sm" />
        </D.Trigger>
      </Tooltip>
      <DialogContent title="New board" description={`A fresh board in ${live.workspace.name}.`} className="max-w-sm">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setOpen(false);
            void addBoard(live, name, router);
          }}
        >
          <label htmlFor="board-name" className="text-xs font-medium text-ink-2">
            Name
          </label>
          <Input
            id="board-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mobile app"
            maxLength={60}
            required
            autoFocus
          />
          <Button type="submit" variant="primary" disabled={!name.trim()} className="self-end">
            <Icon name="plus" /> Create board
          </Button>
        </form>
      </DialogContent>
    </D.Root>
  );
}
