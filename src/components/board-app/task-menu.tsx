"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { PriorityIcon, SizeIcon, StatusMarker } from "@/components/board";
import { Avatar } from "@/components/ui/display";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  archiveTasks,
  people,
  personById,
  priorities,
  sizes,
  statuses,
  statusTitle,
  type BoardAction,
  type Task,
} from "@/lib/board-store";

type MenuProps = {
  task: Task;
  dispatch: (a: BoardAction) => void;
  onOpen: (id: string) => void;
};

// Every card and row has one of these, so its items are only built while it's open
export function TaskMenu({ children, ...props }: MenuProps & { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <ContextMenu onOpenChange={setOpen}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      {open ? <TaskMenuContent {...props} /> : null}
    </ContextMenu>
  );
}

/**
 * One menu for a long list of tasks, such as the table's rows, opened for whichever task was right-clicked or
 * long-pressed. Each menu listens to the whole page while it's on it, so a menu per row would mean hundreds of
 * listeners running on every key press. Off a task, the browser's own menu shows, as it would without this
 */
export function TaskMenuList({
  tasks,
  taskAt,
  open,
  onOpenChange,
  dispatch,
  onOpen,
  children,
}: Omit<MenuProps, "task"> & {
  tasks: Record<string, Task>;
  /** The task an element inside the list belongs to, if any */
  taskAt: (el: Element) => string | null;
  /** The task whose menu is open */
  open: string | null;
  onOpenChange: (id: string | null) => void;
  /** The one element holding the list, which takes the events */
  children: React.ReactElement;
}) {
  // The task under the last press, noted before the menu hears of it
  const pressed = useRef<string | null>(null);
  const find = (e: React.SyntheticEvent) => (e.target instanceof Element ? taskAt(e.target) : null);
  const task = open ? tasks[open] : undefined;
  return (
    <ContextMenu open={Boolean(task)} onOpenChange={(next) => onOpenChange(next ? pressed.current : null)}>
      <ContextMenuTrigger
        asChild
        onPointerDownCapture={(e) => {
          pressed.current = find(e);
        }}
        onContextMenuCapture={(e) => {
          pressed.current = find(e);
          // Stopped here, before the menu's own handler, the event keeps its default: the browser's menu
          if (!pressed.current) e.stopPropagation();
        }}
      >
        {children}
      </ContextMenuTrigger>
      {task ? <TaskMenuContent task={task} dispatch={dispatch} onOpen={onOpen} /> : null}
    </ContextMenu>
  );
}

function TaskMenuContent({ task, dispatch, onOpen }: MenuProps) {
  const update = (patch: Partial<Task>, note: string) => dispatch({ type: "update", id: task.id, patch, note });
  const person = personById(task.assignee);

  return (
    <ContextMenuContent className="w-56">
      <ContextMenuLabel className="truncate">
        {task.id} · {task.title}
      </ContextMenuLabel>
      <ContextMenuItem onSelect={() => onOpen(task.id)}>
        <Icon name="panel" /> Open
      </ContextMenuItem>
      <ContextMenuSeparator />

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <StatusMarker status={task.status} /> Status
          <span className="ml-auto text-xs text-ink-3">{statusTitle[task.status]}</span>
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuRadioGroup
            value={task.status}
            onValueChange={(v) => update({ status: v as Task["status"] }, `moved it to ${statusTitle[v as Task["status"]]}`)}
          >
            {statuses.map((s) => (
              <ContextMenuRadioItem key={s.id} value={s.id}>
                <StatusMarker status={s.id} /> {s.title}
              </ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <PriorityIcon priority={task.priority} /> Priority
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuRadioGroup
            value={task.priority}
            onValueChange={(v) => update({ priority: v as Task["priority"] }, `set priority to ${priorities.find((p) => p.id === v)?.title}`)}
          >
            {priorities.map((p) => (
              <ContextMenuRadioItem key={p.id} value={p.id}>
                <PriorityIcon priority={p.id} /> {p.title}
              </ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <SizeIcon size={task.size} /> Size
          <span className="ml-auto font-mono text-xs text-ink-3 uppercase">{task.size ?? "—"}</span>
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuRadioGroup
            value={task.size ?? "none"}
            onValueChange={(v) =>
              update(
                { size: v === "none" ? undefined : (v as Task["size"]) },
                v === "none" ? "removed the size" : `sized it ${v.toUpperCase()}`,
              )
            }
          >
            {sizes.map((z) => (
              <ContextMenuRadioItem key={z.id} value={z.id}>
                <SizeIcon size={z.id} /> {z.title}
              </ContextMenuRadioItem>
            ))}
            <ContextMenuRadioItem value="none">
              <SizeIcon /> No size
            </ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          {person ? (
            <Avatar name={person.name} src={person.avatar} tone={person.tone} size="xs" className="!size-4 text-[8px]" />
          ) : (
            <span className="size-4 border border-dashed border-line-strong" />
          )}
          Assignee
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuRadioGroup
            value={task.assignee ?? "none"}
            onValueChange={(v) =>
              update(
                { assignee: v === "none" ? undefined : v },
                v === "none" ? "removed the assignee" : `assigned ${personById(v)?.name}`,
              )
            }
          >
            {people.map((p) => (
              <ContextMenuRadioItem key={p.id} value={p.id}>
                <Avatar name={p.name} src={p.avatar} tone={p.tone} size="xs" /> {p.name}
              </ContextMenuRadioItem>
            ))}
            <ContextMenuRadioItem value="none">
              <span className="size-5 border border-dashed border-line-strong" /> Unassigned
            </ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuItem
        onSelect={() =>
          update(
            { public: !task.public },
            task.public ? "took it off the public roadmap" : "added it to the public roadmap",
          )
        }
      >
        <Icon name="globe" /> {task.public ? "Take off the roadmap" : "Add to the roadmap"}
      </ContextMenuItem>

      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => navigator.clipboard?.writeText(task.id).catch(() => {})}>
        <Icon name="copy" /> Copy ID
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => dispatch(archiveTasks([task.id], !task.archived))}>
        <Icon name="archive" /> {task.archived ? "Unarchive" : "Archive"}
      </ContextMenuItem>
      <ContextMenuItem danger onSelect={() => dispatch({ type: "delete", ids: [task.id] })}>
        <Icon name="trash" /> Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
