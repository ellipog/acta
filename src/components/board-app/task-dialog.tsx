"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog as D } from "radix-ui";
import { Icon } from "@/components/ui/icons";
import { PixelTick } from "@/components/ui/pixel";
import { StatusMarker } from "@/components/board";
import { Avatar } from "@/components/ui/display";
import { Badge, Kbd } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/combobox";
import { Switch } from "@/components/ui/controls";
import { DitherFill } from "@/components/ui/dither";
import { DatePicker } from "@/components/ui/date-picker";
import { Markdown, MarkdownEditor } from "@/components/ui/markdown";
import { Tooltip } from "@/components/ui/tooltip";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  archiveTasks,
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
import { cn } from "@/lib/utils";
import { CustomFieldInput } from "./custom-fields";
import { fieldOptions, noteFor, patchFor, valueOf, type GroupField } from "./fields";
import { githubOn, TaskLinks } from "./task-links";
import { branchName } from "@/lib/github/match";

export function TaskDialog({
  task,
  dispatch,
  onClose,
  order = [],
  onOpen,
  canEdit = true,
}: {
  task: Task | null;
  dispatch: (a: BoardAction) => void;
  onClose: () => void;
  order?: string[];
  onOpen?: (id: string) => void;
  canEdit?: boolean;
}) {
  return (
    <D.Root open={Boolean(task)} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="sheet-overlay fixed inset-0 z-40 bg-ink/25">
          <DitherFill level={25} className="absolute inset-0 opacity-25" />
        </D.Overlay>
        <D.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-1rem)] focus:outline-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-4xl sm:-translate-x-1/2 sm:-translate-y-1/2"
        >
          {task ? (
            <TaskBody key={task.id} task={task} dispatch={dispatch} onClose={onClose} order={order} onOpen={onOpen} canEdit={canEdit} />
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
}: {
  task: Task;
  dispatch: (a: BoardAction) => void;
  onClose: () => void;
  order: string[];
  onOpen?: (id: string) => void;
  canEdit: boolean;
}) {
  const [title, setTitle] = useState(task.title);
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(task.description);
  const [subDraft, setSubDraft] = useState("");
  const [comment, setComment] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [allActivity, setAllActivity] = useState(false);
  const [now] = useState(() => Date.now());

  const update = (patch: Partial<Task>, note?: string) => dispatch({ type: "update", id: task.id, patch, note });
  const setField = (field: GroupField, value: string) => {
    if (valueOf(task, field)[0] !== value) update(patchFor(field, value), noteFor(field, value));
  };
  const done = task.subtasks.filter((s) => s.done).length;
  const index = order.indexOf(task.id);
  const prev = index > 0 ? order[index - 1] : null;
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : null;
  const thread = task.thread ?? [];
  const earlier = Math.max(0, task.comments - thread.length);
  const activity = [...task.activity].reverse();

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
    if (!comment.trim()) return;
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
    if (description !== task.description) update({ description }, "edited the description");
    setEditing(false);
  };

  const nav = "grid size-7 place-items-center text-ink-3 hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="relative isolate">
      <DitherFill level={50} className="absolute inset-0 -z-10 hidden translate-x-2 translate-y-2 sm:block" />
      <div className="flex max-h-[calc(100dvh-1rem)] flex-col border-t border-ink bg-raised sm:max-h-[calc(100dvh-2rem)] sm:border">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line pr-2 pl-4 font-mono text-[11px] text-ink-3">
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
                  <button aria-label="Previous task" disabled={!prev} onClick={() => prev && onOpen(prev)} className={nav}>
                    <Icon name="chevron-up" size="sm" />
                  </button>
                </Tooltip>
                <Tooltip content={<span>Next <Kbd className="ml-1 border-ink-3 bg-transparent text-page">J</Kbd></span>}>
                  <button aria-label="Next task" disabled={!next} onClick={() => next && onOpen(next)} className={nav}>
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

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="min-w-0 border-line px-4 py-4 sm:px-6 md:border-r">
            <D.Title asChild>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title.trim() && title !== task.title && update({ title: title.trim() }, "renamed the task")}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                aria-label="Title"
                className="w-full bg-transparent font-display text-2xl leading-tight outline-none"
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
                    <Button size="sm" variant="primary" onClick={saveDescription}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : task.description ? (
                <div className="group relative -mx-2 px-2 py-1 hover:bg-surface">
                  <Markdown source={task.description} />
                  <button
                    onClick={() => setEditing(true)}
                    aria-label="Edit description"
                    className="absolute top-1 right-1 grid size-7 place-items-center text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 pointer-coarse:opacity-100"
                  >
                    <Icon name="pencil" size="sm" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setEditing(true)} className="text-sm text-ink-3 hover:text-ink">
                  Add a description…
                </button>
              )}
            </section>

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

            <TaskLinks task={task} canEdit={canEdit} />

            <section className="mt-6">
              <h3 className="text-xs font-medium text-ink-2">
                Comments <span className="font-mono text-[11px] font-normal text-ink-3">{task.comments}</span>
              </h3>
              {earlier ? (
                <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-ink-3">
                  <span className="h-px flex-1 bg-line" />
                  {earlier} earlier {earlier === 1 ? "comment" : "comments"}
                  <span className="h-px flex-1 bg-line" />
                </p>
              ) : null}
              <ol className="mt-3 space-y-4">
                {thread.map((c) => {
                  // A comment brought over from elsewhere shows who wrote it there, then who added it here
                  const person = c.from ? undefined : people.find((p) => p.name.startsWith(c.who));
                  return (
                    <li key={c.id} className="flex gap-3">
                      {person ? (
                        <Avatar name={person.name} src={person.avatar} tone={person.tone} size="sm" />
                      ) : (
                        <Avatar name={c.from ?? c.who} tone={c.from ? "pyrite" : "lapis"} size="sm" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs">
                          <span className="font-medium">{c.from ?? c.who}</span>
                          {c.from ? <span className="text-ink-3"> · added by {c.who}</span> : null}
                          {c.via ? <span className="text-ink-3"> via {c.via}</span> : null}
                          <span className="ml-1.5 font-mono text-[11px] text-ink-3">{timeAgo(c.at, now)}</span>
                        </p>
                        <Markdown source={c.body} className="mt-1" />
                      </div>
                    </li>
                  );
                })}
              </ol>
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
                  <Button size="sm" variant="primary" disabled={!comment.trim()} onClick={send}>
                    Comment
                  </Button>
                </div>
              </div>
            </section>

            <section className="mt-6 mb-2">
              <h3 className="text-xs font-medium text-ink-2">Activity</h3>
              <ol className="mt-3">
                {(allActivity ? activity : activity.slice(0, 6)).map((a, i, all) => (
                  <li key={`${a.at}-${i}`} className="relative flex gap-3 pb-3 pl-1">
                    <span className="relative flex w-3 shrink-0 justify-center">
                      <span className={cn("relative z-10 mt-1 size-2", i === 0 ? "bg-lapis" : "border border-line-strong bg-raised")} />
                      {i < all.length - 1 ? <span className="absolute top-3 bottom-[-0.25rem] w-px bg-line" /> : null}
                    </span>
                    <p className="text-xs text-ink-2">
                      <span className="font-medium text-ink">{a.who}</span>
                      {a.via ? <span className="text-ink-3"> via {a.via}</span> : null} {a.text}
                      <span className="ml-1.5 font-mono text-[11px] text-ink-3">{timeAgo(a.at, now)}</span>
                    </p>
                  </li>
                ))}
              </ol>
              {activity.length > 6 ? (
                <button onClick={() => setAllActivity((v) => !v)} className="ml-5 text-[11px] text-ink-3 hover:text-ink">
                  {allActivity ? "Show less" : `Show all ${activity.length}`}
                </button>
              ) : null}
            </section>
          </div>

          <aside className="flex flex-col gap-4 bg-surface px-4 py-4 text-sm">
            {(["status", "assignee", "priority", "size", "project"] as GroupField[]).map((f) => (
              <Prop key={f} label={{ status: "Status", assignee: "Assignee", priority: "Priority", size: "Size", project: "Project" }[f]}>
                <Select
                  aria-label={f}
                  value={valueOf(task, f)[0]}
                  onValueChange={(v) => setField(f, v)}
                  options={fieldOptions[f]}
                />
              </Prop>
            ))}
            <div className="grid grid-cols-2 gap-2">
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
            <Prop label="Labels">
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
              <Prop key={f.id} label={f.name}>
                <CustomFieldInput task={task} field={f} onChange={(custom, note) => update({ custom }, note)} />
              </Prop>
            ))}
            <Prop label="Public roadmap">
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
            <p className="font-mono text-[11px] leading-relaxed text-ink-3">
              Created {timeAgo(task.activity[0]?.at ?? now, now)}
              <br />
              Updated {timeAgo(task.activity.at(-1)?.at ?? now, now)}
            </p>
            <button
              onClick={() => {
                dispatch(archiveTasks([task.id], !task.archived));
                if (!task.archived) onClose();
              }}
              className="mt-auto flex h-8 items-center gap-2 border border-transparent px-2 text-xs text-ink-3 hover:text-ink"
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
                "flex h-8 items-center gap-2 border px-2 text-xs",
                confirmDelete ? "border-hematite bg-hematite text-on-accent" : "border-transparent text-ink-3 hover:text-hematite",
              )}
            >
              <Icon name="trash" size="sm" />
              {confirmDelete ? "Click again to delete" : "Delete task"}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11px] text-ink-3">{label}</span>
      {children}
    </div>
  );
}
