"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Dialog as D } from "radix-ui";
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
import { inOrder, setBoardOrder, useBoardOrder } from "@/lib/account-prefs";
import { boardIcon } from "@/lib/board-icons";
import { addBoard, removeBoard, saveBoard } from "@/lib/board-actions";
import { slowNetwork, startReading } from "@/lib/board-ahead";
import { boardPath, peekBoard, useCounts } from "@/lib/board-cache";
import { useBoardEdits } from "@/lib/board-edits";
import { can, isManager, type BoardSummary, type LiveBoard } from "@/lib/live";
import { publicHref } from "@/lib/slugs";
import { cn } from "@/lib/utils";
import { lazyPart } from "@/components/lazy-part";

// The boards in the sidebar, in the order each person drags them into. Right-click one, long-press it or use its ⋯
// button for its menu, which can move it too

// Editing or deleting a board opens a dialog of its own, which arrives when a board's menu first opens
const BoardEditor = lazyPart(() => import("@/components/board-editor").then((m) => m.BoardEditor));
const DeleteBoardDialog = lazyPart(() => import("@/components/board-editor").then((m) => m.DeleteBoardDialog));
const preloadEditor = (open: boolean) => {
  if (!open) return;
  BoardEditor.preload().catch(() => {});
  DeleteBoardDialog.preload().catch(() => {});
};

// Dragging needs a drag and drop library nothing else in the sidebar uses, so it arrives once a mouse first reaches
// the boards, and stays for every board after on this page. Touch moves boards from their menus instead
type SortKit = typeof import("./board-sort");
let sortKit: SortKit | null = null;
const loadSort = () => import("./board-sort").then((m) => (sortKit = m));

const arrayMove = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
};

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
  onMove,
}: {
  kit: Kit;
  board: BoardSummary;
  href: string;
  roadmap?: string;
  settings: string;
  canDelete: boolean;
  onEdit?: () => void;
  onDelete: () => void;
  onMove: { up?: () => void; down?: () => void };
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
      {onMove.up || onMove.down ? (
        <>
          <Separator />
          {onMove.up ? (
            <Item onSelect={onMove.up}>
              <Icon name="arrow-up" /> Move up
            </Item>
          ) : null}
          {onMove.down ? (
            <Item onSelect={onMove.down}>
              <Icon name="arrow-down" /> Move down
            </Item>
          ) : null}
        </>
      ) : null}
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

  const order = useBoardOrder(live.workspace.id);
  const boards = inOrder(live.boards, order);
  const ids = boards.map((b) => b.id);
  const move = (from: number, to: number) =>
    setBoardOrder(live.workspace.id, arrayMove(boards, from, to).map((b) => b.id));
  // Letting go of a dragged board mustn't also open it
  const dragging = useRef(false);
  const onDragEnd = (from: string, to: string | null) => {
    setTimeout(() => (dragging.current = false));
    if (!to || from === to) return;
    move(ids.indexOf(from), ids.indexOf(to));
  };

  // Until the drag and drop code is here the rows are plain ones. The draggable rows that replace them are drawn
  // anew, so they take over while no button is held, which can't break a click, and focus goes back where it was
  const [kit, setKit] = useState(() => sortKit);
  const arrived = useRef<SortKit | null>(null);
  const refocus = useRef<{ board: string; at: number } | null>(null);
  const rowsId = useId();
  const reach = (e: React.PointerEvent) => {
    if (!kit && e.pointerType !== "touch") void loadSort().then((m) => (arrived.current = m));
  };
  const takeOver = (e: React.PointerEvent) => {
    const m = arrived.current;
    if (kit || !m || e.buttons) return;
    arrived.current = null;
    const el = document.activeElement;
    const row = el instanceof HTMLElement ? el.closest<HTMLElement>(`[data-rows="${rowsId}"]`) : null;
    if (row) refocus.current = { board: row.dataset.board!, at: [...row.querySelectorAll("a, button")].indexOf(el!) };
    setKit(() => m);
  };
  useLayoutEffect(() => {
    const was = refocus.current;
    if (!was) return;
    refocus.current = null;
    const row = document.querySelector(`[data-rows="${rowsId}"][data-board="${was.board}"]`);
    row?.querySelectorAll<HTMLElement>("a, button")[was.at]?.focus();
  }, [kit, rowsId]);

  // A board this tab doesn't hold is read as the pointer rests on its link, as it's pressed, or as the keyboard rests
  // on it, so the click shows it at once, or at least sooner. The boards next door are read ahead already
  const resting = useRef<ReturnType<typeof setTimeout>>(undefined);
  const unaim = () => clearTimeout(resting.current);
  const aim = (slug: string, wait: number) => {
    unaim();
    if (slowNetwork()) return;
    resting.current = setTimeout(() => startReading(ws, slug, { keep: true }), wait);
  };
  useEffect(() => unaim, []);

  const editable = (b: BoardSummary) => {
    if (b.id === live.board.id) return live.board;
    const cached = peekBoard(boardPath(ws, b.slug))?.board;
    return {
      id: b.id,
      slug: b.slug,
      name: b.name,
      icon: b.icon,
      labels: cached?.labels,
      projects: cached?.projects,
      fields: cached?.fields,
      statusNames: cached?.statusNames,
    };
  };

  const rows = boards.map((b, i) => {
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
      onMove: {
        up: i > 0 ? () => move(i, i - 1) : undefined,
        down: i < boards.length - 1 ? () => move(i, i + 1) : undefined,
      },
    };
    // The count stays put and steps aside for the ⋯ button while it shows
    const room = "group-focus-within/board:pr-8 group-hover/board:pr-8 group-has-data-[state=open]/board:pr-8";
    const inner = (
      <>
        <Icon name={boardIcon(b.icon)} size="sm" />
        <span className="truncate">{b.name}</span>
        {count !== undefined ? (
          <span className="ml-auto font-mono text-[11px] text-ink-3 tabular-nums">{count}</span>
        ) : null}
      </>
    );
    const row = (
      <ContextMenu onOpenChange={preloadEditor}>
        <ContextMenuTrigger asChild>
          <div className="group/board relative">
            {current ? (
              <button className={cn(item(active), room)} onClick={onNavigate} aria-current="page">
                {inner}
              </button>
            ) : (
              <Link
                href={href}
                className={cn(item(false), room)}
                onClick={onNavigate}
                onPointerEnter={() => aim(b.slug, 80)}
                onPointerLeave={unaim}
                onPointerDown={() => aim(b.slug, 0)}
                onFocus={() => aim(b.slug, 150)}
                onBlur={unaim}
              >
                {inner}
              </Link>
            )}
            <DropdownMenu onOpenChange={preloadEditor}>
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
    return kit ? (
      <kit.SortableBoard key={b.id} id={b.id} dragging={dragging} data-rows={rowsId} data-board={b.id}>
        {row}
      </kit.SortableBoard>
    ) : (
      <div
        key={b.id}
        className="relative"
        data-rows={rowsId}
        data-board={b.id}
        onPointerEnter={reach}
        onPointerMove={takeOver}
      >
        {row}
      </div>
    );
  });

  return (
    <>
      {kit ? (
        <kit.SortableBoards
          ids={ids}
          onStart={() => (dragging.current = true)}
          onEnd={onDragEnd}
          onCancel={() => setTimeout(() => (dragging.current = false))}
        >
          {rows}
        </kit.SortableBoards>
      ) : (
        rows
      )}
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
            const next = boards.find((b) => b.id !== deleting.id)?.slug ?? null;
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
