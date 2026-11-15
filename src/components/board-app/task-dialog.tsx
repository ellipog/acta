"use client";

import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Dialog as D } from "radix-ui";
import { Icon } from "@/components/ui/icons";
import { PixelTick } from "@/components/ui/pixel";
import { StatusMarker } from "@/components/board";
import { Avatar, Skeleton } from "@/components/ui/display";
import { Badge, Kbd } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/combobox";
import { Switch } from "@/components/ui/controls";
import { DitherFill } from "@/components/ui/dither";
import { DatePicker } from "@/components/ui/date-picker";
import { Markdown, MarkdownEditor, UploadContext } from "@/components/ui/markdown";
import { Tooltip } from "@/components/ui/tooltip";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  archiveTasks,
  boardMetaVersion,
  closed,
  customFields,
  formatDue,
  labelTone,
  me,
  people,
  stageOf,
  timeAgo,
  type BoardAction,
  type Task,
} from "@/lib/board-store";
import { duration, timeToClose } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { CustomFieldInput } from "./custom-fields";
import { fieldOptions, noteFor, patchFor, valueOf, type GroupField } from "./fields";
import { githubOn, TaskLinks } from "./task-links";
import { TaskFiles, useTaskFiles } from "./task-files";
import { branchName } from "@/lib/github/match";

export function TaskDialog({
  task,
  dispatch,
  onClose,
  order = [],
  onOpen,
  canEdit = true,
  comments,
}: {
  task: Task | null;
  dispatch: (a: BoardAction) => void;
  onClose: () => void;
  order?: string[];
  onOpen?: (id: string) => void;
  canEdit?: boolean;
  comments?: CommentRights;
}) {
  return (
    <D.Root open={Boolean(task)} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="sheet-overlay fixed inset-0 z-40 bg-ink/25">
          <DitherFill level={25} className="absolute inset-0 opacity-25" />
        </D.Overlay>
        <D.Content
          aria-describedby={undefined}
          // Escape in a comment being edited only leaves the edit
          onEscapeKeyDown={(e) => {
            if (e.target instanceof Element && e.target.closest("[data-comment-edit]")) e.preventDefault();
          }}
          data-side="bottom"
          className="sheet fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-0.75rem)] focus:outline-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-4xl sm:-translate-x-1/2 sm:-translate-y-1/2"
        >
          {task ? (
            <TaskBody
              key={task.id}
              task={task}
              dispatch={dispatch}
              onClose={onClose}
              order={order}
              onOpen={onOpen}
              canEdit={canEdit}
              comments={comments}
            />
          ) : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function TaskBody({
  task,
  dispatch,
  onClose,
  order,
  onOpen,
  canEdit,
  comments,
}: {
  task: Task;
  dispatch: (a: BoardAction) => void;
  onClose: () => void;
  order: string[];
  onOpen?: (id: string) => void;
  canEdit: boolean;
  comments?: CommentRights;
}) {
  const [title, setTitle] = useState(task.title);
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(task.description);
  const [subDraft, setSubDraft] = useState("");
  const [comment, setComment] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [allActivity, setAllActivity] = useState(false);
  const [now] = useState(() => Date.now());
  const taskFiles = useTaskFiles(task.id);
  // Text with an image still uploading waits for it, so its placeholder is never what's saved
  const uploading = taskFiles.pending > 0;

  const update =(patch: Partial<Task>, note?: string) => dispatch({ type: "update", id: task.id, patch, note });
  const setField = (field: GroupField, value: string) => {
    if (valueOf(task, field)[0] !== value) update(patchFor(field, value), noteFor(field, value));
  };
  const done = task.subtasks.filter((s) => s.done).length;
  const index = order.indexOf(task.id);
  const prev = index > 0 ? order[index - 1] : null;
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : null;
  const thread = task.thread ?? [];
  // A long thread draws its first comments with the rest of the task and the others a moment after, so the task
  // shows at once rather than once every comment is laid out
  const drawn = useDeferredValue(thread.length, Math.min(thread.length, FIRST_COMMENTS));
  const earlier = Math.max(0, task.comments - thread.length);
  const activityCount = task.activity.length;
  // Only the latest activity is loaded, so its first entry is the creation only on a task without much history
  const opened = task.opened ? Date.parse(task.opened) : task.activity[0]?.at;
  const took = timeToClose(task);

  useEffect(() => {
    if (!onOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, [role=listbox], [role=menu]")) return;
      if (e.key === "j" && next) onOpen(next);
      if (e.key === "k" && prev) onOpen(prev);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onOpen]);

  const send = () => {
    if (!comment.trim() || uploading) return;
    dispatch({ type: "comment", id: task.id, body: comment.trim() });
    setComment("");
  };

  const pending = useRef<string | null>(null);
  const latest = useRef({ id: task.id, saved: task.description, dispatch });
  useEffect(() => {
    pending.current = editing ? description : null;
    latest.current = { id: task.id, saved: task.description, dispatch };
  });
  useEffect(
    () => () => {
      const text = pending.current;
      const { id, saved, dispatch: send } = latest.current;
      if (text !== null && text !== saved)
        send({ type: "update", id, patch: { description: text }, note: "edited the description" });
    },
    [],
  );

  const saveDescription = () => {
    if (uploading) return;
    if (description !== task.description) update({ description }, "edited the description");
    setEditing(false);
  };
  // Editing starts from the description as it is now, which may have come in, or changed, since the task opened
  const editDescription = () => {
    setDescription(task.description);
    setEditing(true);
  };

  const { sheet, handlers: pull } = usePullToClose(onClose);

  // Where a field can't size itself to its text, the title grows with what's typed
  const titleField = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = titleField.current;
    if (!el || CSS.supports("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  const nav =
    "grid size-7 place-items-center text-ink-3 hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-30 pointer-coarse:size-10";

  // When the task was made and closed, and archiving or deleting it. Under the fields when wide, and at the very
  // end on a phone, below the thread, where they can't be pressed on the way to something else
  const closing = (
    <>
      <p className="font-mono text-[11px] leading-relaxed text-ink-3">
        <span title={opened ? fullTime(opened) : undefined}>Created {timeAgo(opened ?? now, now)}</span>
        {task.closed ? (
          <>
            <br />
            <span title={fullTime(Date.parse(task.closed))}>
              {task.status === "canceled" ? "Canceled" : "Closed"} {timeAgo(Date.parse(task.closed), now)}
            </span>
            {took !== null ? (
              <>
                <br />
                <span>Took {duration(took)}</span>
              </>
            ) : null}
          </>
        ) : null}
        <br />
        Updated {timeAgo(task.activity.at(-1)?.at ?? now, now)}
      </p>
      <div className="mt-2 flex flex-col md:mt-auto">
        <button
          onClick={() => {
            dispatch(archiveTasks([task.id], !task.archived));
            if (!task.archived) onClose();
          }}
          className="flex h-8 items-center gap-2 border border-transparent px-2 text-xs text-ink-3 hover:text-ink pointer-coarse:h-11 pointer-coarse:text-sm"
        >
          <Icon name="archive" size="sm" />
          {task.archived ? "Bring back from the archive" : "Archive task"}
        </button>
        <button
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            dispatch({ type: "delete", ids: [task.id] });
            onClose();
          }}
          onBlur={() => setConfirmDelete(false)}
          className={cn(
            "flex h-8 items-center gap-2 border px-2 text-xs pointer-coarse:h-11 pointer-coarse:text-sm",
            confirmDelete ? "border-hematite bg-hematite text-on-accent" : "border-transparent text-ink-3 hover:text-hematite",
          )}
        >
          <Icon name="trash" size="sm" />
          {confirmDelete ? "Press again to delete" : "Delete task"}
        </button>
      </div>
    </>
  );

  return (
    <UploadContext value={taskFiles.upload}>
    <div ref={sheet} className="relative isolate">
      <DitherFill level={50} className="absolute inset-0 -z-10 hidden translate-x-2 translate-y-2 sm:block" />
      <div className="flex max-h-[calc(100dvh-0.75rem)] flex-col border-t border-ink bg-raised sm:max-h-[calc(100dvh-2rem)] sm:border">
        <div
          {...pull}
          className="shrink-0 touch-none sm:touch-auto"
        >
        <div aria-hidden className="flex h-2.5 items-end justify-center sm:hidden">
          <span className="h-1 w-9 bg-line-strong" />
        </div>
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line pr-2 pl-4 font-mono text-[11px] text-ink-3 pointer-coarse:h-12">
          <StatusMarker status={task.status} />
          <span>{task.id}</span>
          {task.project ? <span className="truncate">· {task.project}</span> : null}
          <div className="ml-auto flex items-center">
            {onOpen && order.length > 1 ? (
              <>
                <span className="mr-1.5 hidden sm:inline">
                  {index + 1} / {order.length}
                </span>
                <Tooltip content={<span>Previous <Kbd className="ml-1 border-ink-3 bg-transparent text-page">K</Kbd></span>}>
                  <button
                    aria-label="Previous task"
                    disabled={!prev}
                    onClick={() => prev && onOpen(prev)}
                    data-task={prev ?? undefined}
                    className={nav}
                  >
                    <Icon name="chevron-up" size="sm" />
                  </button>
                </Tooltip>
                <Tooltip content={<span>Next <Kbd className="ml-1 border-ink-3 bg-transparent text-page">J</Kbd></span>}>
                  <button
                    aria-label="Next task"
                    disabled={!next}
                    onClick={() => next && onOpen(next)}
                    data-task={next ?? undefined}
                    className={nav}
                  >
                    <Icon name="chevron-down" size="sm" />
                  </button>
                </Tooltip>
                <span className="mx-1 h-4 w-px bg-line" />
              </>
            ) : null}
            {githubOn && me.live ? (
              <Tooltip content="Copy branch name">
                <button
                  aria-label="Copy branch name"
                  onClick={() => {
                    const name = branchName(task.id, task.title);
                    navigator.clipboard?.writeText(name).catch(() => {});
                    toast({ icon: "copy", title: "Branch name copied", description: name, duration: 1800 });
                  }}
                  className={nav}
                >
                  <Icon name="signpost" size="sm" />
                </button>
              </Tooltip>
            ) : null}
            <Tooltip content="Copy link">
              <button
                aria-label="Copy link"
                onClick={() => {
                  const path = me.live ? location.pathname : "/demo";
                  navigator.clipboard?.writeText(`${location.origin}${path}#${task.id}`).catch(() => {});
                  toast({ icon: "link", title: "Link copied", description: task.id, duration: 1800 });
                }}
                className={nav}
              >
                <Icon name="link" size="sm" />
              </button>
            </Tooltip>
            <D.Close className={nav} aria-label="Close">
              <Icon name="x" size="sm" />
            </D.Close>
          </div>
        </div>
        </div>

        {/* Wide, the task's text runs down the left and its fields down the right. On a phone the fields come
            straight after the title and description, where a thumb finds them, and the thread follows */}
        <div className="grid min-h-0 flex-1 overflow-y-auto overscroll-contain md:grid-cols-[minmax(0,1fr)_16rem] md:grid-rows-[auto_1fr]">
          <div className="order-1 min-w-0 border-line px-4 pt-4 pb-5 sm:px-6 md:col-start-1 md:row-start-1 md:border-r md:pb-0">
            <D.Title asChild>
              {/* Wraps onto as many lines as the title takes, so a long one reads whole on a phone. It's still one
                  line of text: Enter saves, and a pasted line break becomes a space */}
              <textarea
                ref={titleField}
                rows={1}
                value={title}
                onChange={(e) => setTitle(e.target.value.replace(/\s*\n\s*/g, " "))}
                onBlur={() => title.trim() && title !== task.title && update({ title: title.trim() }, "renamed the task")}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  e.currentTarget.blur();
                }}
                enterKeyHint="done"
                aria-label="Title"
                className="block w-full resize-none overflow-hidden bg-transparent font-display text-2xl leading-tight outline-none [field-sizing:content]"
              />
            </D.Title>

            <section className="mt-3">
              {editing ? (
                <div>
                  <MarkdownEditor
                    autoFocus
                    value={description}
                    onChange={setDescription}
                    onSubmit={saveDescription}
                    rows={5}
                    placeholder="What needs doing, and why. Markdown works."
                    aria-label="Description"
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <span className="mr-auto text-[11px] text-ink-3">
                      <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> to save
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDescription(task.description);
                        setEditing(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" onClick={saveDescription} disabled={uploading}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : task.brief ? (
                // The description is being read. It can't be edited until it's in, so an edit can't save over it
                <Skeleton className="h-12" />
              ) : task.description ? (
                <div className="group relative -mx-2 px-2 py-1 hover:bg-surface">
                  <Markdown source={task.description} />
                  <button
                    onClick={editDescription}
                    aria-label="Edit description"
                    className="absolute top-1 right-1 grid size-7 place-items-center text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 pointer-coarse:opacity-100"
                  >
                    <Icon name="pencil" size="sm" />
                  </button>
                </div>
              ) : (
                <button onClick={editDescription} className="text-sm text-ink-3 hover:text-ink">
                  Add a description…
                </button>
              )}
            </section>
          </div>

          <div className="order-3 min-w-0 border-line px-4 pb-4 sm:px-6 md:col-start-1 md:row-start-2 md:border-r">
            <section className="mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-ink-2">Subtasks</h3>
                {task.subtasks.length ? (
                  <span className="font-mono text-[11px] text-ink-3">
                    {done}/{task.subtasks.length}
                  </span>
                ) : null}
              </div>
              {task.subtasks.length ? (
                <div className="mt-2 flex h-1.5 gap-px">
                  {task.subtasks.map((s) => (
                    <span key={s.id} className={cn("flex-1", s.done ? "bg-lapis" : "bg-line")} />
                  ))}
                </div>
              ) : null}
              <ul className="mt-2">
                {task.subtasks.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => dispatch({ type: "toggleSubtask", id: task.id, subId: s.id })}
                      className="flex w-full items-center gap-2.5 px-1 py-1.5 text-left text-sm hover:bg-sunken"
                    >
                      <span
                        className={cn(
                          "grid size-4 shrink-0 place-items-center border",
                          s.done ? "border-lapis bg-lapis text-on-accent" : "border-line-strong bg-raised",
                        )}
                      >
                        {s.done ? <PixelTick /> : null}
                      </span>
                      <span className={cn(s.done && "text-ink-3 line-through")}>{s.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (subDraft.trim()) dispatch({ type: "addSubtask", id: task.id, title: subDraft.trim() });
                  setSubDraft("");
                }}
                className="mt-1 flex items-center gap-2.5 px-1"
              >
                <Icon name="plus" className="text-ink-3" />
                <input
                  value={subDraft}
                  onChange={(e) => setSubDraft(e.target.value)}
                  placeholder="Add a subtask"
                  aria-label="New subtask"
                  className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
                />
              </form>
            </section>

            <TaskFiles files={taskFiles.files} upload={taskFiles.upload} remove={taskFiles.remove} canEdit={canEdit} />

            <TaskLinks task={task} canEdit={canEdit} />

            <section className="mt-6">
              <h3 className="text-xs font-medium text-ink-2">
                Comments <span className="font-mono text-[11px] font-normal text-ink-3">{task.comments}</span>
              </h3>
              {earlier && task.partial ? (
                // The rest of the thread is being read. Anything newer, like a comment just written, shows below it
                <Skeleton className="mt-3 h-12" />
              ) : earlier ? (
                <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-ink-3">
                  <span className="h-px flex-1 bg-line" />
                  {earlier} earlier {earlier === 1 ? "comment" : "comments"}
                  <span className="h-px flex-1 bg-line" />
                </p>
              ) : null}
              <Thread
                task={task.id}
                thread={thread}
                upTo={Math.max(drawn, Math.min(thread.length, FIRST_COMMENTS))}
                now={now}
                version={boardMetaVersion()}
                rights={comments}
              />

              <div className="mt-4">
                <MarkdownEditor
                  value={comment}
                  onChange={setComment}
                  onSubmit={send}
                  rows={2}
                  placeholder="Leave a comment. Markdown and @mentions work."
                  aria-label="New comment"
                />
                <div className="mt-2 flex items-center justify-end gap-3">
                  <span className="hidden text-[11px] text-ink-3 sm:inline">
                    <Kbd>⌘</Kbd> <Kbd>Enter</Kbd>
                  </span>
                  <Button size="sm" variant="primary" disabled={!comment.trim() || uploading} onClick={send}>
                    Comment
                  </Button>
                </div>
              </div>
            </section>

            <section className="mt-6 mb-2">
              <h3 className="text-xs font-medium text-ink-2">Activity</h3>
              <ActivityList activity={task.activity} all={allActivity} now={now} />
              {/* The board has only the latest lines until the rest are read */}
              {task.partial ? <Skeleton className="mb-3 ml-5 h-8" /> : null}
              {activityCount > 6 ? (
                <button onClick={() => setAllActivity((v) => !v)} className="ml-5 text-[11px] text-ink-3 hover:text-ink">
                  {allActivity ? "Show less" : `Show all ${activityCount}`}
                </button>
              ) : null}
            </section>
            <div className="mt-6 flex flex-col gap-1 border-t border-line pt-4 pb-safe md:hidden">{closing}</div>
          </div>

          <aside className="order-2 grid grid-cols-2 gap-x-3 gap-y-4 border-y border-line bg-surface px-4 py-4 text-sm md:col-start-2 md:row-span-2 md:row-start-1 md:flex md:flex-col md:gap-4 md:border-y-0">
            {(["status", "assignee", "priority", "size", "project"] as GroupField[]).map((f) => (
              <Prop
                key={f}
                label={{ status: "Status", assignee: "Assignee", priority: "Priority", size: "Size", project: "Project" }[f]}
                wide={f === "project"}
              >
                <Select
                  aria-label={f}
                  value={valueOf(task, f)[0]}
                  onValueChange={(v) => setField(f, v)}
                  options={fieldOptions[f]}
                />
              </Prop>
            ))}
            <div className="col-span-2 grid grid-cols-2 gap-x-3 gap-y-2 md:gap-2">
              <Prop label="Start">
                <DatePicker
                  aria-label="Start date"
                  placeholder="None"
                  value={task.start}
                  onChange={(d) => update({ start: d }, d ? `set the start date to ${formatDue(d)}` : "removed the start date")}
                  className="px-2"
                />
              </Prop>
              <Prop label="Due">
                <DatePicker
                  aria-label="Due date"
                  placeholder="None"
                  due={!closed(task.status)}
                  value={task.due}
                  onChange={(d) => update({ due: d }, d ? `set the due date to ${formatDue(d)}` : "removed the due date")}
                  className="px-2"
                />
              </Prop>
            </div>
            <Prop label="Labels" wide>
              <MultiSelect
                aria-label="Labels"
                placeholder="No labels"
                searchPlaceholder="Find a label"
                value={task.labels}
                onValueChange={(next) => {
                  const added = next.find((l) => !task.labels.includes(l));
                  const removed = task.labels.find((l) => !next.includes(l));
                  update({ labels: next }, added ? `added label ${added}` : removed ? `removed label ${removed}` : undefined);
                }}
                options={fieldOptions.label}
                renderValue={(chosen) =>
                  chosen.map((o) => (
                    <Badge key={o.value} tone={labelTone(o.value)}>
                      {o.label}
                    </Badge>
                  ))
                }
              />
            </Prop>
            {customFields.map((f) => (
              <Prop key={f.id} label={f.name} wide>
                <CustomFieldInput task={task} field={f} onChange={(custom, note) => update({ custom }, note)} />
              </Prop>
            ))}
            <Prop label="Public roadmap" wide>
              <label className="flex items-center justify-between gap-3 border border-line bg-raised px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-sm">{task.public ? "Visible to visitors" : "Not on the roadmap"}</span>
                  {task.public ? (
                    <span className="block font-mono text-[11px] text-ink-3">
                      {task.votes ?? 0} votes · {{ planned: "Planned", progress: "In progress", shipped: "Shipped" }[stageOf(task)]}
                    </span>
                  ) : null}
                </span>
                <Switch
                  checked={!!task.public}
                  onCheckedChange={(on) =>
                    update({ public: on }, on ? "added it to the public roadmap" : "took it off the public roadmap")
                  }
                  aria-label="Show on the public roadmap"
                />
              </label>
            </Prop>
            <div className="hidden md:flex md:flex-1 md:flex-col md:gap-4">{closing}</div>
          </aside>
        </div>
      </div>
    </div>
    </UploadContext>
  );
}

/**
 * On a phone the task is a sheet from the bottom, and its top pulls down to put it away, as sheets do there. The
 * sheet follows the finger, and goes back up unless it was pulled far enough or flicked down. The buttons along the
 * top still take taps
 */
function usePullToClose(onClose: () => void) {
  const sheet = useRef<HTMLDivElement>(null);
  const pull = useRef<{ id: number; from: number; at: number; time: number } | null>(null);
  const place = (y: number, settle: boolean) => {
    const el = sheet.current;
    if (!el) return;
    el.style.transition = settle ? "transform 160ms cubic-bezier(.2,.8,.2,1)" : "";
    el.style.transform = y ? `translateY(${y}px)` : "";
  };
  const end = (e: React.PointerEvent) => {
    const p = pull.current;
    if (!p || p.id !== e.pointerId) return;
    pull.current = null;
    const moved = e.clientY - p.from;
    const speed = (e.clientY - p.at) / Math.max(1, e.timeStamp - p.time);
    if (e.type === "pointerup" && (moved > 110 || (moved > 24 && speed > 0.5))) {
      place(sheet.current?.offsetHeight ?? 600, true);
      setTimeout(onClose, 140);
    } else place(0, true);
  };
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch" || innerWidth >= 640) return;
      if (e.target instanceof Element && e.target.closest("button, a, input")) return;
      pull.current = { id: e.pointerId, from: e.clientY, at: e.clientY, time: e.timeStamp };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = pull.current;
      if (!p || p.id !== e.pointerId) return;
      p.at = e.clientY;
      p.time = e.timeStamp;
      place(Math.max(0, e.clientY - p.from), false);
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
  return { sheet, handlers };
}

// How many comments a task shows as it opens, before the rest of a long thread
const FIRST_COMMENTS = 12;

const fullTime = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

// On a phone the fields sit two to a row, and a wide one takes the whole row
function Prop({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", wide && "col-span-2")}>
      <span className="text-[11px] text-ink-3">{label}</span>
      {children}
    </div>
  );
}

type Comment = NonNullable<Task["thread"]>[number];

// The thread and the activity draw again only when they change, not with each key typed elsewhere in the task. A long
// thread was laid out again, avatar and Markdown check and all, for every letter of a title or a comment
const Thread = memo(function Thread({
  task,
  thread,
  upTo,
  now,
  rights,
}: {
  task: string;
  thread: Comment[];
  upTo: number;
  now: number;
  // Moves when the board's people change, so their names and pictures follow
  version: number;
  rights?: CommentRights;
}) {
  return (
    <ol className="mt-3 space-y-4">
      {thread.slice(0, upTo).map((c) => (
        <ThreadComment key={c.id} task={task} comment={c} now={now} rights={rights} />
      ))}
    </ol>
  );
});

/** What the task dialog can do with comments already written, and whether you may */
export type CommentRights = {
  // You may still comment here, which editing your own needs too
  canWrite: boolean;
  // You may take back anyone's, as owners and admins can
  canRemoveAny: boolean;
  edit: (task: string, id: string, body: string) => Promise<boolean>;
  remove: (task: string, id: string) => Promise<boolean>;
};

function ThreadComment({
  task,
  comment: c,
  now,
  rights,
}: {
  task: string;
  comment: Comment;
  now: number;
  rights?: CommentRights;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  // A comment brought over from elsewhere shows who wrote it there, then who added it here
  const person = c.from ? undefined : people.find((p) => p.name.startsWith(c.who));
  const yours = Boolean(c.by) && c.by === me.id;
  // One brought over from elsewhere says what someone else wrote, so it isn't yours to reword
  const canChange = Boolean(rights?.canWrite) && yours && !c.from;
  const canRemove = Boolean(rights) && (yours || Boolean(rights?.canRemoveAny));

  const save = async () => {
    const body = draft?.trim().slice(0, 10_000);
    if (!rights || !body || busy) return;
    if (body === c.body) return setDraft(null);
    setBusy(true);
    const ok = await rights.edit(task, c.id, body);
    setBusy(false);
    if (ok) setDraft(null);
    else toast({ icon: "x", title: "Your edit didn’t save", description: "Check your connection and try again." });
  };

  const remove = async () => {
    if (!rights || busy) return;
    if (!confirm) return setConfirm(true);
    setBusy(true);
    const ok = await rights.remove(task, c.id);
    setBusy(false);
    setConfirm(false);
    if (!ok) toast({ icon: "x", title: "The comment wasn’t deleted", description: "Check your connection and try again." });
  };

  return (
    // Comments out of view are laid out and painted only as they scroll near
    <li className="group/comment flex gap-3 [contain-intrinsic-size:auto_4rem] [content-visibility:auto]">
      {person ? (
        <Avatar name={person.name} src={person.avatar} tone={person.tone} size="sm" />
      ) : (
        <Avatar name={c.from ?? c.who} tone={c.from ? "pyrite" : "lapis"} size="sm" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-xs">
            <span className="font-medium">{c.from ?? c.who}</span>
            {c.from ? <span className="text-ink-3"> · added by {c.who}</span> : null}
            {c.via ? <span className="text-ink-3"> via {c.via}</span> : null}
            <span className="ml-1.5 font-mono text-[11px] text-ink-3" title={fullTime(c.at)}>
              {timeAgo(c.at, now)}
            </span>
            {c.edited ? (
              <span className="ml-1.5 font-mono text-[11px] text-ink-3" title={`Edited ${fullTime(c.edited)}`}>
                · edited
              </span>
            ) : null}
          </p>
          {draft === null && (canChange || canRemove) ? (
            // Out of the way until you point at the comment or move to it, and always there on a touch screen
            <span
              className={cn(
                "flex shrink-0 items-center gap-0.5 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/comment:opacity-100 [@media(hover:hover)]:group-hover/comment:opacity-100",
                confirm && "opacity-100 [@media(hover:hover)]:opacity-100",
              )}
            >
              {canChange && !confirm ? (
                <Tooltip content="Edit comment">
                  <button
                    type="button"
                    aria-label="Edit comment"
                    onClick={() => setDraft(c.body)}
                    className="grid size-6 place-items-center text-ink-3 hover:text-ink"
                  >
                    <Icon name="pencil" size="sm" />
                  </button>
                </Tooltip>
              ) : null}
              {canRemove ? (
                confirm ? (
                  <button
                    type="button"
                    onClick={remove}
                    onBlur={() => setConfirm(false)}
                    disabled={busy}
                    autoFocus
                    className="flex h-6 items-center gap-1.5 border border-hematite bg-hematite px-2 text-[11px] text-on-accent disabled:opacity-50"
                  >
                    <Icon name="trash" size="sm" />
                    {busy ? "Deleting…" : "Click again to delete"}
                  </button>
                ) : (
                  <Tooltip content={yours ? "Delete comment" : `Delete ${c.from ?? c.who}’s comment`}>
                    <button
                      type="button"
                      aria-label="Delete comment"
                      onClick={remove}
                      className="grid size-6 place-items-center text-ink-3 hover:text-hematite"
                    >
                      <Icon name="trash" size="sm" />
                    </button>
                  </Tooltip>
                )
              ) : null}
            </span>
          ) : null}
        </div>
        {draft === null ? (
          <Markdown source={c.body} className="mt-1" />
        ) : (
          <div
            className="mt-2"
            // Escape leaves the edit, not the task (the dialog lets it by, see TaskDialog)
            data-comment-edit=""
            onKeyDown={(e) => {
              if (e.key === "Escape" && !busy) setDraft(null);
            }}
          >
            <MarkdownEditor value={draft} onChange={setDraft} onSubmit={save} rows={2} autoFocus aria-label="Edit comment" />
            <div className="mt-2 flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={save} disabled={busy || !draft.trim()}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

const ActivityList = memo(function ActivityList({
  activity,
  all,
  now,
}: {
  activity: Task["activity"];
  all: boolean;
  now: number;
}) {
  const newest = useMemo(() => [...activity].reverse(), [activity]);
  return (
    <ol className="mt-3">
      {(all ? newest : newest.slice(0, 6)).map((a, i, shown) => (
        <li key={`${a.at}-${i}`} className="relative flex gap-3 pb-3 pl-1">
          <span className="relative flex w-3 shrink-0 justify-center">
            <span className={cn("relative z-10 mt-1 size-2", i === 0 ? "bg-lapis" : "border border-line-strong bg-raised")} />
            {i < shown.length - 1 ? <span className="absolute top-3 bottom-[-0.25rem] w-px bg-line" /> : null}
          </span>
          <p className="text-xs text-ink-2">
            <span className="font-medium text-ink">{a.who}</span>
            {a.via ? <span className="text-ink-3"> via {a.via}</span> : null} {a.text}
            <span className="ml-1.5 font-mono text-[11px] text-ink-3">{timeAgo(a.at, now)}</span>
          </p>
        </li>
      ))}
    </ol>
  );
});
