"use client";

import { useReducer, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/badge";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Checkbox, NumberField, Radio, RadioGroup, Segmented, Slider, Switch } from "@/components/ui/controls";
import { ColorPicker, minerals, Swatch } from "@/components/ui/color-picker";
import { Calendar, DatePicker, DueLabel, useToday } from "@/components/ui/date-picker";
import { Combobox, MultiSelect } from "@/components/ui/combobox";
import { Markdown, MarkdownEditor } from "@/components/ui/markdown";
import { Icon, iconNames, type IconName } from "@/components/ui/icons";
import { Select } from "@/components/ui/select";
import { Skeleton, Spinner } from "@/components/ui/display";
import { toast } from "@/components/ui/toast";
import { CommandPalette } from "@/components/command-palette";
import { PriorityIcon, SizeIcon, StatusMarker, TaskCard } from "@/components/board";
import { TaskMenu } from "@/components/board-app/task-menu";
import { fieldOptions, LabelDot } from "@/components/board-app/fields";
import {
  boardReducer,
  demoMeta,
  people,
  priorities,
  seedBoard,
  setBoardMeta,
  sizes,
  statuses,
} from "@/lib/board-store";
import { addDays } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  SheetContent,
  Tooltip,
} from "@/components/ui/overlays";
import { Avatar } from "@/components/ui/display";

export function IconGallery() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-10">
        <figure>
          <div
            className="relative size-[92px] border border-line bg-raised"
            style={{
              backgroundImage:
                "linear-gradient(to right, var(--line) 1px, transparent 1px), linear-gradient(to bottom, var(--line) 1px, transparent 1px)",
              backgroundSize: "10px 10px",
              backgroundPosition: "0 0",
            }}
          >
            <Icon name="board" size="xl" className="absolute top-0 left-0 size-[90px] text-lapis/85" />
          </div>
          <figcaption className="mt-2 font-mono text-[11px] text-ink-3">9 × 9, one-pixel strokes</figcaption>
        </figure>
        <figure>
          <div className="flex items-end gap-5 text-ink">
            {(["sm", "md", "lg", "xl"] as const).map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <Icon name="calendar" size={s} />
                <span className="font-mono text-[10px] text-ink-3">{s}</span>
              </div>
            ))}
          </div>
          <figcaption className="mt-2 font-mono text-[11px] text-ink-3">Whole-pixel scales: 1.5, 2, 3, 5</figcaption>
        </figure>
      </div>

      <div className="grid grid-cols-3 border-t border-l border-line sm:grid-cols-5 lg:grid-cols-8">
        {iconNames.map((name) => (
          <button
            key={name}
            onClick={() => {
              navigator.clipboard?.writeText(`<Icon name="${name}" />`).catch(() => {});
              toast({ icon: "copy", title: "Copied", description: `<Icon name="${name}" />`, duration: 2500 });
            }}
            className="group flex h-24 flex-col items-center justify-center gap-3 border-r border-b border-line bg-raised text-ink-2 transition-colors hover:bg-lapis-soft hover:text-lapis-ink"
          >
            <Icon name={name as IconName} />
            <span className="font-mono text-[10px] text-ink-3 group-hover:text-lapis-ink">{name}</span>
          </button>
        ))}
      </div>
      <p className="-mt-4 text-xs text-ink-3">Click any icon to copy it.</p>
    </div>
  );
}

const alertKinds = [
  ["mentions", "Mentions"],
  ["assigned", "Tasks assigned to me"],
  ["moves", "Status changes"],
] as const satisfies readonly (readonly [string, string])[];

export function FormDemo() {
  const [notify, setNotify] = useState(true);
  const [estimate, setEstimate] = useState(3);
  const [visibility, setVisibility] = useState("workspace");
  const [view, setView] = useState("board");
  const [confidence, setConfidence] = useState([70]);
  const [range, setRange] = useState([20, 80]);
  const [alerts, setAlerts] = useState<string[]>(["mentions"]);
  const every = alerts.length === alertKinds.length ? true : alerts.length ? "indeterminate" : false;

  return (
    <div className="grid max-w-2xl gap-x-6 gap-y-5 sm:grid-cols-2">
      <Field label="Title" htmlFor="f-title">
        <Input id="f-title" defaultValue="Ship the public roadmap page" />
      </Field>
      <Field label="Key" htmlFor="f-key" error="That key is already used by another board.">
        <Input id="f-key" defaultValue="ACT" aria-invalid className="font-mono" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Description" htmlFor="f-desc" hint="Markdown, rendered in the task view.">
          <Textarea id="f-desc" defaultValue={"Opt-in per board. Public tasks grouped as **Planned**, **In progress** and **Shipped**."} />
        </Field>
      </div>
      <Field label="Estimate" htmlFor="f-estimate" hint="Arrow keys step by one, Shift by ten.">
        <NumberField id="f-estimate" value={estimate} onChange={setEstimate} min={0} max={99} suffix="pts" />
      </Field>
      <Field label="Default view">
        <Segmented
          aria-label="Default view"
          value={view}
          onValueChange={setView}
          options={[
            { value: "board", label: "Board" },
            { value: "table", label: "Table" },
            { value: "roadmap", label: "Roadmap" },
          ]}
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between">
          <Label>Confidence</Label>
          <span className="font-mono text-xs text-ink-2">{confidence[0]}%</span>
        </div>
        <Slider aria-label="Confidence" value={confidence} onValueChange={setConfidence} max={100} step={5} />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between">
          <Label>Range</Label>
          <span className="font-mono text-xs text-ink-2">
            {range[0]}–{range[1]}
          </span>
        </div>
        <Slider aria-label="Range" value={range} onValueChange={setRange} max={100} minStepsBetweenThumbs={5} />
      </div>
      <div className="flex flex-col gap-3">
        <Label>Visibility</Label>
        <RadioGroup value={visibility} onValueChange={setVisibility}>
          <Radio value="private" hint="Only you.">
            Private
          </Radio>
          <Radio value="workspace" hint="Everyone in Ellipog Team.">
            Workspace
          </Radio>
          <Radio value="public" hint="Anyone with the link can read and vote.">
            Public
          </Radio>
        </RadioGroup>
      </div>
      <div className="flex flex-col gap-3">
        <Label>Notify me about</Label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={every}
            onCheckedChange={(v) => setAlerts(v === true ? alertKinds.map(([id]) => id) : [])}
          />
          Everything
        </label>
        {alertKinds.map(([id, label]) => (
          <label key={id} className="ml-6 flex items-center gap-2 text-sm">
            <Checkbox
              checked={alerts.includes(id)}
              onCheckedChange={(v) => setAlerts((a) => (v ? [...a, id] : a.filter((x) => x !== id)))}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox defaultChecked /> Show on public roadmap
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={notify} onCheckedChange={setNotify} /> Email me
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-3">
          <Switch disabled /> Disabled
        </label>
      </div>
    </div>
  );
}

export function PickerDemo() {
  setBoardMeta(demoMeta);
  const [status, setStatus] = useState<(typeof statuses)[number]["id"]>("in_progress");
  const [priority, setPriority] = useState<(typeof priorities)[number]["id"]>("high");
  const [size, setSize] = useState<(typeof sizes)[number]["id"]>("m");
  const [assignee, setAssignee] = useState("mara");
  const [group, setGroup] = useState("status");
  const [due, setDue] = useState<string | undefined>();
  const [day, setDay] = useState<string | undefined>("2026-11-12");
  const [label, setLabel] = useState("malachite");
  const [ink, setInk] = useState("#7a4fa3");
  const [project, setProject] = useState<string | undefined>("Roadmap");
  const [blocker, setBlocker] = useState<string | undefined>();
  const [tags, setTags] = useState(["Feature", "Design"]);

  return (
    <div className="flex flex-col gap-10">
      <div className="grid max-w-2xl gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field label="Select" htmlFor="p-status" hint="Icons ride along into the trigger.">
          <Select
            id="p-status"
            value={status}
            onValueChange={setStatus}
            options={statuses.map((s) => ({ value: s.id, label: s.title, icon: <StatusMarker status={s.id} /> }))}
          />
        </Field>
        <Field label="With hints" htmlFor="p-priority">
          <Select
            id="p-priority"
            value={priority}
            onValueChange={setPriority}
            options={priorities.map((p, i) => ({ value: p.id, label: p.title, icon: <PriorityIcon priority={p.id} />, hint: `P${i}` }))}
          />
        </Field>
        <Field label="People" htmlFor="p-assignee">
          <Select
            id="p-assignee"
            value={assignee}
            onValueChange={setAssignee}
            options={people.map((p) => ({ value: p.id, label: p.name, icon: <Avatar name={p.name} tone={p.tone} size="xs" /> }))}
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <Label>Ghost and compact, for tables and toolbars</Label>
          <div className="flex h-9 items-center gap-3">
            <div className="w-28 border-b border-dashed border-line">
              <Select
                variant="ghost"
                aria-label="Size"
                value={size}
                onValueChange={setSize}
                options={sizes.map((z) => ({ value: z.id, label: z.title, icon: <SizeIcon size={z.id} /> }))}
              />
            </div>
            <span className="flex items-center gap-1.5 text-xs text-ink-3">
              Group
              <Select
                variant="compact"
                aria-label="Group by"
                value={group}
                onValueChange={setGroup}
                options={[
                  { value: "status", label: "Status" },
                  { value: "project", label: "Project" },
                  { value: "none", label: "None" },
                ]}
              />
            </span>
          </div>
        </div>
        <Field label="Searchable" htmlFor="p-project" hint="Type to narrow. Fits long lists.">
          <Combobox
            id="p-project"
            value={project}
            onValueChange={setProject}
            options={fieldOptions.project}
            searchPlaceholder="Find a project"
          />
        </Field>
        <Field label="Many at once" htmlFor="p-labels" hint="The list stays open while you pick.">
          <MultiSelect
            id="p-labels"
            value={tags}
            onValueChange={setTags}
            options={fieldOptions.label}
            searchPlaceholder="Find a label"
            renderValue={(chosen) => (
              <span className="flex min-w-0 items-center gap-2">
                {chosen.map((o) => (
                  <span key={o.value} className="flex shrink-0 items-center gap-1.5">
                    <LabelDot id={o.value} />
                    {o.label}
                  </span>
                ))}
              </span>
            )}
          />
        </Field>
        <Field label="Long lists" htmlFor="p-blocker" hint="Every task on the board, with its ID.">
          <Combobox
            id="p-blocker"
            value={blocker}
            onValueChange={setBlocker}
            placeholder="Blocked by…"
            searchPlaceholder="Find a task"
            empty="No task matches"
            options={Object.values(seedBoard().tasks).map((t) => ({
              value: t.id,
              label: t.title,
              icon: <StatusMarker status={t.status} />,
              hint: t.id,
            }))}
          />
        </Field>
        <Field label="Date" htmlFor="p-due" hint="Click the month or year to jump.">
          <DatePicker id="p-due" value={due} onChange={setDue} />
        </Field>
        <Field label="Mineral" htmlFor="p-label" hint="The six label colors, readable in both themes.">
          <ColorPicker id="p-label" value={label} onChange={setLabel} />
        </Field>
        <Field label="Any color" htmlFor="p-ink" hint="A dithered field, a hue strip and hex.">
          <ColorPicker id="p-ink" custom value={ink} onChange={setInk} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <Label>Swatches</Label>
          <div className="flex h-9 items-center gap-1.5">
            {minerals.map((m) => (
              <Tooltip key={m.value} content={m.name}>
                <span>
                  <Swatch value={m.value} className="size-7" />
                </span>
              </Tooltip>
            ))}
            <Swatch value={ink} className="size-7" />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Calendar, inline</Label>
        <div className="w-fit border border-line-strong bg-raised">
          <Calendar value={day} onSelect={setDay} />
        </div>
        <p className="text-xs text-ink-3">
          Arrows move a day or a week, <Kbd>PgUp</Kbd> <Kbd>PgDn</Kbd> a month. The seam runs from today to the date.
        </p>
      </div>
    </div>
  );
}

export function OverlayDemos() {
  const [color, setColor] = useState("lapis");
  const [wip, setWip] = useState(5);
  const [group, setGroup] = useState("status");
  const [shown, setShown] = useState(["assignee", "priority", "due"]);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open dialog</Button>
        </DialogTrigger>
        <DialogContent title="New board" description="Boards hold tasks, fields and views.">
          <div className="flex flex-col gap-4">
            <Field label="Name" htmlFor="board-name">
              <Input id="board-name" placeholder="Portfolio site" />
            </Field>
            <div className="grid grid-cols-[7rem_1fr_9rem] gap-3">
              <Field label="Key" htmlFor="board-key">
                <Input id="board-key" placeholder="ACT" className="font-mono uppercase" />
              </Field>
              <Field label="Color" htmlFor="board-color">
                <ColorPicker id="board-color" value={color} onChange={setColor} />
              </Field>
              <Field label="WIP limit" htmlFor="board-wip">
                <NumberField id="board-wip" value={wip} onChange={setWip} min={1} max={20} />
              </Field>
            </div>
            <p className="-mt-2 text-xs text-ink-3">The key prefixes task numbers, like ACT-42.</p>
            <div className="mt-2 flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  variant="primary"
                  onClick={() => toast({ icon: "board", title: "Board created", description: "It’s empty. Press C to add a task." })}
                >
                  Create board
                </Button>
              </DialogClose>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            Task actions <Icon name="chevron-down" size="sm" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>ACT-42</DropdownMenuLabel>
          <DropdownMenuItem>
            <Icon name="pencil" /> Edit <Kbd className="ml-auto">E</Kbd>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Icon name="link" /> Copy link
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Icon name="archive" /> Archive
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem danger>
            <Icon name="trash" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            <Icon name="sort" /> View options <Icon name="chevron-down" size="sm" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Group by</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={group} onValueChange={setGroup}>
            {[
              ["status", "Status"],
              ["assignee", "Assignee"],
              ["none", "Nothing"],
            ].map(([v, l]) => (
              <DropdownMenuRadioItem key={v} value={v}>
                {l}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Icon name="columns" /> Fields
              <span className="ml-auto font-mono text-[11px] text-ink-3">{shown.length}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              {[
                ["assignee", "Assignee"],
                ["priority", "Priority"],
                ["size", "Size"],
                ["due", "Due"],
                ["labels", "Labels"],
              ].map(([v, l]) => (
                <DropdownMenuCheckboxItem
                  key={v}
                  checked={shown.includes(v)}
                  onCheckedChange={(c) => setShown((f) => (c ? [...f, v] : f.filter((x) => x !== v)))}
                >
                  {l}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      {(["left", "right"] as const).map((side) => (
        <Dialog key={side}>
          <DialogTrigger asChild>
            <Button>
              <Icon name={side === "left" ? "menu" : "panel"} /> Sheet, {side}
            </Button>
          </DialogTrigger>
          <SheetContent side={side} title={side === "left" ? "Navigation" : "Details"}>
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
              <span className="font-display">{side === "left" ? "Ellipog Team" : "ACT-42"}</span>
              <DialogClose className="grid size-7 place-items-center text-ink-3 hover:bg-sunken hover:text-ink" aria-label="Close">
                <Icon name="x" size="sm" />
              </DialogClose>
            </div>
            {side === "left" ? (
              <nav className="flex flex-col p-2 text-sm">
                {(
                  [
                    ["inbox", "Inbox"],
                    ["user", "My tasks"],
                    ["board", "Portfolio site"],
                    ["board", "Mobile app"],
                    ["globe", "Public roadmap"],
                  ] as [IconName, string][]
                ).map(([icon, label], i) => (
                  <a
                    key={label}
                    href="#overlays"
                    className={cn(
                      "flex h-9 items-center gap-2.5 px-2 text-ink-2 hover:bg-sunken hover:text-ink",
                      i === 2 && "bg-lapis-soft text-lapis-ink",
                    )}
                  >
                    <Icon name={icon} /> {label}
                  </a>
                ))}
              </nav>
            ) : (
              <div className="flex flex-col gap-4 p-4">
                <p className="text-sm">Ship the public roadmap page</p>
                <dl className="grid grid-cols-[6rem_1fr] gap-y-2.5 text-sm">
                  <dt className="text-ink-3">Status</dt>
                  <dd className="flex items-center gap-2">
                    <StatusMarker status="in_progress" /> In progress
                  </dd>
                  <dt className="text-ink-3">Priority</dt>
                  <dd className="flex items-center gap-2">
                    <PriorityIcon priority="high" /> High
                  </dd>
                  <dt className="text-ink-3">Size</dt>
                  <dd className="flex items-center gap-2">
                    <SizeIcon size="l" /> Large
                  </dd>
                </dl>
                <p className="text-xs text-ink-3">Sheets slide in from an edge. On phones the board’s sidebar is one.</p>
              </div>
            )}
          </SheetContent>
        </Dialog>
      ))}

      <CommandPalette
        trigger={(open) => (
          <Button onClick={open}>
            <Icon name="search" /> Command palette
          </Button>
        )}
      />

      <Tooltip content="Tooltips are ink on stone">
        <Button variant="ghost">Hover me</Button>
      </Tooltip>
      <Tooltip content="Below, when there’s no room above" side="bottom">
        <Button variant="ghost" size="icon" aria-label="Info">
          <Icon name="eye" />
        </Button>
      </Tooltip>
    </div>
  );
}

export function ContextMenuDemo() {
  setBoardMeta(demoMeta);
  const [board, dispatch] = useReducer(boardReducer, undefined, seedBoard);
  const task = board.tasks["ACT-42"];
  return (
    <div className="grid gap-6 sm:grid-cols-[18rem_1fr] sm:items-center">
      {task ? (
        <TaskMenu task={task} dispatch={dispatch} onOpen={() => toast({ icon: "panel", title: "Would open ACT-42" })}>
          <div className="cursor-context-menu">
            <TaskCard task={task} />
          </div>
        </TaskMenu>
      ) : (
        <Button onClick={() => dispatch({ type: "reset", state: seedBoard() })}>
          <Icon name="undo" /> Bring ACT-42 back
        </Button>
      )}
      <p className="text-sm text-ink-2">
        Right-click the card, or long-press on touch. Status, priority, size and assignee change in place, without
        opening the task.
      </p>
    </div>
  );
}

export function FeedbackDemo() {
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => toast({ title: "Saved", description: "Changes are live for everyone." })}>Toast</Button>
        <Button
          onClick={() =>
            toast({
              icon: "trash",
              title: "Deleted ACT-58",
              description: "Basalt dark theme pass",
              action: { label: "Undo", onClick: () => toast({ icon: "undo", title: "Restored ACT-58", duration: 2500 }) },
            })
          }
        >
          With undo
        </Button>
        <Button
          onClick={() => toast({ icon: "bell", title: "Mara mentioned you", description: "“Can you look at the vote limits?”" })}
        >
          Mention
        </Button>
        <Button
          variant="primary"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            setTimeout(() => {
              setSaving(false);
              toast({ title: "Board saved" });
            }, 1600);
          }}
          className="min-w-28"
        >
          {saving ? (
            <>
              <Spinner className="[&>span.spin-cell]:bg-on-accent/40" /> Saving
            </>
          ) : (
            "Save board"
          )}
        </Button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 font-mono text-[11px] text-ink-3">Skeleton card</p>
          <div className="flex flex-col gap-2.5 border border-line bg-raised p-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="mt-1 flex items-center gap-2">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="ml-auto size-6" />
            </div>
          </div>
        </div>
        <div>
          <p className="mb-2 font-mono text-[11px] text-ink-3">Spinner</p>
          <div className="flex h-[118px] items-center justify-center gap-6 border border-line bg-raised">
            <Spinner />
            <span className="flex items-center gap-2 text-sm text-ink-2">
              <Spinner /> Syncing board
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const notifications = [
  { who: "mara", what: "mentioned you on", task: "ACT-42", note: "“Can you look at the vote limits?”", when: "2m", unread: true, icon: "comment" },
  { who: "jon", what: "assigned you", task: "ACT-38", note: "Table view: inline editing", when: "1h", unread: true, icon: "user" },
  { who: "ines", what: "moved to Done", task: "ACT-29", note: "Invite flow with email tokens", when: "Yesterday", unread: false, icon: "check" },
] as const;

export function InboxDemo() {
  setBoardMeta(demoMeta);
  const [read, setRead] = useState<string[]>([]);
  return (
    <div className="max-w-xl border border-line bg-raised">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Icon name="inbox" className="text-ink-2" />
        <h3 className="text-sm font-medium">Inbox</h3>
        <button onClick={() => setRead(notifications.map((n) => n.task))} className="ml-auto text-xs text-ink-3 hover:text-ink">
          Mark all read
        </button>
      </div>
      <ul>
        {notifications.map((n) => {
          const person = people.find((p) => p.id === n.who)!;
          const unread = n.unread && !read.includes(n.task);
          return (
            <li key={n.task}>
              <button
                onClick={() => setRead((r) => [...r, n.task])}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-surface",
                  !unread && "text-ink-2",
                )}
              >
                <span className="relative">
                  <Avatar name={person.name} tone={person.tone} />
                  <span className="absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center border border-line bg-raised text-ink-2">
                    <Icon name={n.icon} size="sm" />
                  </span>
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className={cn(unread && "font-medium")}>{person.name.split(" ")[0]}</span> {n.what}{" "}
                  <span className="font-mono text-xs">{n.task}</span>
                  <span className="block truncate text-xs text-ink-3">{n.note}</span>
                </span>
                <span className="flex flex-col items-end gap-1.5">
                  <span className="font-mono text-[11px] text-ink-3">{n.when}</span>
                  {unread ? <span className="size-2 bg-lapis" aria-label="Unread" /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DueStates() {
  const today = useToday();
  const rows: [string, number, boolean?][] = [
    ["Overdue", -3],
    ["Today", 0],
    ["This week", 3],
    ["Later", 24],
    ["Done, so calm", -3, true],
  ];
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {rows.map(([label, offset, done]) => (
        <li key={label} className="flex h-5 items-center gap-3">
          <span className="w-24 shrink-0 text-ink-2">{label}</span>
          {today ? <DueLabel due={addDays(today, offset)} done={done} className="text-xs" /> : null}
        </li>
      ))}
    </ul>
  );
}

const sample = `### Vote limits
Votes need a **rate limit** per user, or one person can push an item to the top. See [the spec](https://app.acta.page/docs) and ask @Mara.

- One vote per item, per visitor
- Store \`voted_at\` so it can decay
- *Maybe* a cooldown

| Limit | Per | Now |
| --- | --- | ---: |
| Votes | item | 1 |
| Ideas | day | 10 |

> Votes are a signal, not a contract.`;

export function WritingDemo() {
  const [draft, setDraft] = useState("Looks good. Can @Mara check the **vote limits** before we ship?\n\n- Rate limit per user\n- Index on `votes`");
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label>Editor</Label>
        <MarkdownEditor
          value={draft}
          onChange={setDraft}
          rows={6}
          aria-label="Comment"
          onSubmit={() => toast({ icon: "comment", title: "Comment sent", description: draft.split("\n")[0] })}
        />
        <p className="flex flex-wrap items-center gap-1 text-xs text-ink-3">
          <Kbd>⌘</Kbd>
          <Kbd>B</Kbd> bold, <Kbd>⌘</Kbd>
          <Kbd>I</Kbd> italic, <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd> sends.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Rendered, without innerHTML</Label>
        <div className="border border-line bg-raised p-4">
          <Markdown source={sample} />
        </div>
      </div>
    </div>
  );
}
