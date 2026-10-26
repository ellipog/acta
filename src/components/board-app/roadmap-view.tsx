"use client";

import { useState } from "react";
import { Dialog as D } from "radix-ui";
import { ProjectMark, StatusMarker } from "@/components/board";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Segmented, Switch } from "@/components/ui/controls";
import { Swatch } from "@/components/ui/color-picker";
import { formatShort, useToday } from "@/components/ui/date-picker";
import { Dither, DitherFill, DitherShadow, type DitherTone } from "@/components/ui/dither";
import { Avatar, EmptyState, Eyebrow } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { LogoMark } from "@/components/ui/logo-mark";
import { Input, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import {
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from "@/components/ui/overlays";
import { toast } from "@/components/ui/toast";
import { useNow } from "@/lib/hooks";
import { MONTHS } from "@/lib/dates";
import type { DitherName } from "@/lib/dither-assets";
import {
  defaultPage,
  formatDue,
  me,
  personById,
  stageOf,
  statusTitle,
  timeAgo,
  type BoardState,
  type PageLayout,
  type PublicPage,
  type Stage,
  type StatusCategory,
  type Suggestion,
  type Task,
  type Tone,
} from "@/lib/board-store";
import { publicHost, publicHref, publicPath, SLUG_MAX, slugify, slugProblem } from "@/lib/slugs";
import { cn } from "@/lib/utils";
import type { DemoAction } from "./demo-state";
import type { Zoom } from "./fields";
import { TimelineView } from "./timeline-view";

const stageMeta: Record<Stage, { marker: StatusCategory; tone: DitherTone }> = {
  planned: { marker: "todo", tone: "lapis" },
  progress: { marker: "in_progress", tone: "pyrite" },
  shipped: { marker: "done", tone: "malachite" },
};
const stageIds: Stage[] = ["planned", "progress", "shipped"];

const tint: Record<
  Tone,
  {
    solid: string;
    hover: string;
    text: string;
    soft: string;
    ring: string;
    bg: string;
  }
> = {
  lapis: {
    solid: "border-lapis bg-lapis text-on-accent",
    hover: "hover:border-lapis",
    text: "text-lapis",
    soft: "border-lapis/30 bg-lapis-soft text-lapis-ink",
    ring: "focus-visible:ring-lapis",
    bg: "bg-lapis",
  },
  pyrite: {
    solid: "border-pyrite bg-pyrite text-on-accent",
    hover: "hover:border-pyrite",
    text: "text-pyrite-ink",
    soft: "border-pyrite/40 bg-pyrite-soft text-pyrite-ink",
    ring: "focus-visible:ring-pyrite",
    bg: "bg-pyrite",
  },
  malachite: {
    solid: "border-malachite bg-malachite text-on-accent",
    hover: "hover:border-malachite",
    text: "text-malachite",
    soft: "border-malachite/30 bg-malachite-soft text-malachite-ink",
    ring: "focus-visible:ring-malachite",
    bg: "bg-malachite",
  },
  hematite: {
    solid: "border-hematite bg-hematite text-on-accent",
    hover: "hover:border-hematite",
    text: "text-hematite",
    soft: "border-hematite/30 bg-hematite-soft text-hematite-ink",
    ring: "focus-visible:ring-hematite",
    bg: "bg-hematite",
  },
};

const arts: DitherName[] = [
  "crystal-cluster",
  "crystal-tower",
  "crystal-prism",
  "mineral-lapis-surface",
  "mineral-pyrite-cube",
  "basalt-rise",
  "devils-postpile",
  "terrain-badlands-strata",
  "cave-stalactites",
  "terrain-coyote-buttes",
];

const nouns: [string, string][] = [
  ["idea", "ideas"],
  ["suggestion", "suggestions"],
  ["request", "requests"],
  ["wish", "wishes"],
  ["feedback", "feedback"],
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const article = (s: string) => (/^[aeiou]/i.test(s) ? "an" : "a");
const byVotes = (a: Task, b: Task) => (b.votes ?? 0) - (a.votes ?? 0);
const byDue = (a: Task, b: Task) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || byVotes(a, b);
const byShipped = (a: Task, b: Task) => (b.shipped ?? "").localeCompare(a.shipped ?? "");
const month = (iso?: string) => {
  if (!iso) return "Earlier";
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const note = (t: Task) => t.description.split(/(?<=\.)\s/)[0] || (t.project ? `Part of ${t.project}` : "");

type Mode = "manage" | "customize" | "preview";

export function PublicRoadmap({
  state,
  dispatch,
  visible,
  onOpen,
}: {
  state: BoardState;
  dispatch: (a: DemoAction) => void;
  visible: (t: Task) => boolean;
  onOpen: (id: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("manage");
  const isPublic = state.roadmap.public;
  const page = state.roadmap.page;
  const url = publicPath(me.workspace, page.slug);
  const href = publicHref(me.workspace, page.slug);

  const copy = () => {
    navigator.clipboard?.writeText(me.live ? new URL(href, location.href).href : `https://${url}`).catch(() => {});
    toast({
      icon: "link",
      title: "Link copied",
      description: url,
      duration: 2000,
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-3 py-2 @xl:px-4">
        <Segmented
          aria-label="Public roadmap mode"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "manage", label: "Manage" },
            { value: "customize", label: "Customize" },
            { value: "preview", label: "Preview" },
          ]}
          className="w-full @xl:w-72"
        />
        <div
          className={cn("flex min-w-0 items-center gap-1.5 font-mono text-xs", isPublic ? "text-ink-2" : "text-ink-3")}
        >
          <Icon name={isPublic ? "globe" : "lock"} size="sm" className={isPublic ? "text-lapis" : ""} />
          <span className={cn("truncate", !isPublic && "line-through decoration-line-strong")}>{url}</span>
          <Tooltip content="Copy link">
            <button
              aria-label="Copy the public link"
              onClick={copy}
              disabled={!isPublic}
              className="grid size-7 place-items-center text-ink-3 hover:bg-sunken hover:text-ink disabled:opacity-30"
            >
              <Icon name="copy" size="sm" />
            </button>
          </Tooltip>
          {me.live && isPublic ? (
            <Tooltip content="Open the public page">
              <a
                aria-label="Open the public page"
                href={href}
                target="_blank"
                rel="noreferrer"
                className="grid size-7 place-items-center text-ink-3 hover:bg-sunken hover:text-ink"
              >
                <Icon name="external" size="sm" />
              </a>
            </Tooltip>
          ) : null}
        </div>
        <label className="ml-auto flex items-center gap-2.5 text-sm text-ink-2">
          {isPublic ? "Public" : "Private"}
          <Switch
            checked={isPublic}
            onCheckedChange={(v) => {
              dispatch({ type: "roadmap", public: v });
              toast({
                icon: v ? "globe" : "lock",
                title: v ? "The roadmap is public" : "The roadmap is private",
                description: v ? "Anyone with the link can see it." : `Only ${me.team} can see it now.`,
                duration: 2600,
              });
            }}
            aria-label="Public roadmap"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1">
        {mode === "manage" ? (
          <div className="h-full overflow-y-auto">
            <Manage state={state} dispatch={dispatch} visible={visible} onOpen={onOpen} />
          </div>
        ) : mode === "customize" ? (
          <Customize state={state} dispatch={dispatch} />
        ) : (
          <div className="h-full overflow-y-auto bg-sunken/40 p-3 @xl:p-6">
            <Frame url={url}>
              <Visitor state={state} dispatch={dispatch} />
            </Frame>
          </div>
        )}
      </div>
    </div>
  );
}

function Vein({ votes, max, tone }: { votes: number; max: number; tone: DitherTone }) {
  return (
    <div className="relative h-1.5 bg-sunken">
      <DitherFill
        level={tone === "malachite" ? 75 : 50}
        tone={tone}
        className="absolute inset-y-0 left-0 transition-[width] duration-300"
        style={{ width: `${Math.max(3, (votes / Math.max(1, max)) * 100)}%` }}
      />
    </div>
  );
}

function Manage({
  state,
  dispatch,
  visible,
  onOpen,
}: {
  state: BoardState;
  dispatch: (a: DemoAction) => void;
  visible: (t: Task) => boolean;
  onOpen: (id: string) => void;
}) {
  const now = useNow();
  const page = state.roadmap.page;
  const all = Object.values(state.tasks);
  const items = all.filter((t) => t.public && visible(t));
  const max = Math.max(1, ...all.filter((t) => t.public).map((t) => t.votes ?? 0));
  const hidden = all.filter((t) => !t.public).sort((a, b) => a.title.localeCompare(b.title));
  const ideas = [...state.roadmap.suggestions].sort((a, b) => b.votes - a.votes);

  const publish = (id: string, on: boolean) =>
    dispatch({
      type: "update",
      id,
      patch: { public: on },
      note: on ? "added it to the public roadmap" : "took it off the public roadmap",
    });

  return (
    <div className="grid gap-4 p-3 @xl:p-4 @6xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="grid content-start gap-3 @3xl:grid-cols-3">
        {stageIds.map((id) => {
          const list = items.filter((t) => stageOf(t) === id).sort(id === "shipped" ? byShipped : byVotes);
          const votes = list.reduce((n, t) => n + (t.votes ?? 0), 0);
          return (
            <section key={id} className="flex min-w-0 flex-col border border-line bg-sunken/50">
              <DitherFill level={id === "shipped" ? 75 : 50} tone={stageMeta[id].tone} className="h-1 shrink-0" />
              <header className="flex h-10 items-center gap-2 border-b border-line bg-surface px-3">
                <StatusMarker status={stageMeta[id].marker} />
                <h3 className="truncate text-sm font-medium">{page.stageNames[id]}</h3>
                <span className="font-mono text-[11px] text-ink-3">{list.length}</span>
                {votes ? (
                  <Tooltip content="Votes in this stage">
                    <span className="ml-auto flex items-center gap-1 font-mono text-[11px] text-ink-3">
                      <Icon name="chevron-up" size="sm" />
                      {votes}
                    </span>
                  </Tooltip>
                ) : null}
              </header>
              <ul className="flex flex-col gap-2 p-2">
                {list.map((t, i) => {
                  const shownMonth = id === "shipped" && (i === 0 || month(list[i - 1].shipped) !== month(t.shipped));
                  return (
                    <li key={t.id} className="contents">
                      {shownMonth ? (
                        <p className="mt-1 flex items-center gap-2 px-1 font-mono text-[11px] text-ink-3 first:mt-0">
                          {month(t.shipped)}
                          <span className="h-px flex-1 bg-line" />
                        </p>
                      ) : null}
                      <article className="group flex gap-3 border border-line bg-raised p-3 hover:border-line-strong">
                        <Tooltip content={`${t.votes ?? 0} ${t.votes === 1 ? "vote" : "votes"} from visitors`}>
                          <span className="flex h-11 w-10 shrink-0 flex-col items-center justify-center border border-line bg-surface">
                            <Icon name="chevron-up" size="sm" className="text-ink-3" />
                            <span className="font-mono text-[11px] leading-none">{t.votes ?? 0}</span>
                          </span>
                        </Tooltip>
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => onOpen(t.id)}
                            className="text-left text-sm leading-snug hover:text-lapis"
                          >
                            {t.title}
                          </button>
                          <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-ink-3">
                            <StatusMarker status={t.status} className="size-2.5" />
                            <span className="shrink-0">{t.id}</span>
                            <span className="truncate">
                              · {id === "shipped" && t.shipped ? formatDue(t.shipped) : statusTitle[t.status]}
                            </span>
                          </p>
                          <div className="mt-2">
                            <Vein votes={t.votes ?? 0} max={max} tone={stageMeta[id].tone} />
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`${t.id} options`}
                            className="-mt-1 -mr-1 grid size-7 shrink-0 place-items-center text-ink-3 opacity-0 outline-none group-hover:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
                          >
                            <Icon name="dots" size="sm" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onSelect={() => onOpen(t.id)}>
                              <Icon name="panel" /> Open task
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => publish(t.id, false)}>
                              <Icon name="eye-off" /> Take off the roadmap
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </article>
                    </li>
                  );
                })}
                {list.length === 0 ? (
                  <li className="flex flex-col items-center gap-3 py-8 text-center text-xs text-ink-3">
                    <Dither name="crystal-lozenge" tone="line" scale={0.5} smooth />
                    Nothing here yet
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <section className="border border-line bg-raised">
          <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <Icon name="bulb" size="sm" className="text-pyrite" />
            <h3 className="text-sm font-medium">{cap(page.ideaMany)}</h3>
            <span className="font-mono text-[11px] text-ink-3">{ideas.length}</span>
            <span className="ml-auto text-[11px] text-ink-3">
              {page.ideas ? "From visitors" : "Closed to new ones"}
            </span>
          </header>
          {ideas.length ? (
            <ul>
              {ideas.map((s) => (
                <li key={s.id} className="flex items-start gap-3 border-b border-line px-3 py-2.5 last:border-b-0">
                  <span className="mt-0.5 flex w-8 shrink-0 flex-col items-center font-mono text-[11px] text-ink-2">
                    <Icon name="chevron-up" size="sm" className="text-ink-3" />
                    {s.votes}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">{s.title}</p>
                    {s.details ? <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">{s.details}</p> : null}
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {s.by}
                      {now ? ` · ${timeAgo(s.at, now)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0">
                    <Tooltip content={`Accept into ${page.stageNames.planned}`}>
                      <button
                        aria-label={`Accept “${s.title}”`}
                        onClick={() => {
                          const id = `ACT-${state.next}`;
                          dispatch({ type: "acceptSuggestion", id: s.id });
                          toast({
                            icon: "check",
                            title: `Added ${id} to ${page.stageNames.planned}`,
                            description: s.title,
                            action: {
                              label: "Open",
                              onClick: () => onOpen(id),
                            },
                          });
                        }}
                        className="grid size-7 place-items-center text-ink-3 hover:bg-malachite-soft hover:text-malachite"
                      >
                        <Icon name="check" size="sm" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Decline">
                      <button
                        aria-label={`Decline “${s.title}”`}
                        onClick={() => {
                          dispatch({ type: "declineSuggestion", id: s.id });
                          toast({
                            icon: "x",
                            title: "Declined",
                            description: `${s.title}. ⌘Z brings it back.`,
                            duration: 3000,
                          });
                        }}
                        className="grid size-7 place-items-center text-ink-3 hover:bg-hematite-soft hover:text-hematite"
                      >
                        <Icon name="x" size="sm" />
                      </button>
                    </Tooltip>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              art="crystal-tablet"
              title="All caught up"
              body={`New ${page.ideaMany} from visitors land here for you to accept or decline.`}
              className="py-8"
            />
          )}
        </section>

        <section className="border border-line bg-raised p-3">
          <h3 className="text-sm font-medium">Add to the roadmap</h3>
          <p className="mt-0.5 text-xs text-ink-3">
            Visitors only see tasks you put here. Their stage follows the status.
          </p>
          <Combobox
            className="mt-3"
            value={undefined}
            placeholder={hidden.length ? "Choose a task" : "Every task is on it"}
            searchPlaceholder="Find a task"
            empty="No task matches"
            aria-label="Add a task to the roadmap"
            onValueChange={(id) => {
              publish(id, true);
              toast({
                icon: "globe",
                title: `${id} is on the roadmap`,
                description: state.tasks[id]?.title,
                duration: 2400,
              });
            }}
            options={hidden.map((t) => ({
              value: t.id,
              label: t.title,
              icon: <StatusMarker status={t.status} />,
              hint: t.id,
            }))}
          />
        </section>
      </aside>
    </div>
  );
}

function Group({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-mono text-[11px] tracking-[0.1em] text-ink-3 uppercase">{title}</h3>
        {action ? <span className="ml-auto">{action}</span> : null}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Setting({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={cn("flex items-start justify-between gap-4", disabled ? "text-ink-3" : "cursor-pointer")}>
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint ? <span className="block text-[11px] text-ink-3">{hint}</span> : null}
      </span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} className="mt-0.5" />
    </label>
  );
}

function SlugField({ value, onCommit }: { value: string; onCommit: (slug: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const trim = (s: string) => s.replace(/-+$/, "");
  const problem = draft === null ? null : slugProblem(trim(draft));
  return (
    <>
      <div
        className={cn(
          "flex h-9 items-center border bg-raised text-sm focus-within:ring-2",
          problem
            ? "border-hematite focus-within:ring-hematite/25"
            : "border-line-strong focus-within:border-lapis focus-within:ring-lapis/25",
        )}
      >
        <span className="shrink-0 border-r border-line bg-sunken px-2 font-mono text-[11px] leading-[2.15rem] text-ink-3">
          {publicHost}/{me.workspace}/
        </span>
        <input
          id="page-slug"
          value={draft ?? value}
          readOnly={me.live}
          maxLength={SLUG_MAX}
          spellCheck={false}
          aria-invalid={Boolean(problem)}
          aria-describedby="page-slug-hint"
          onFocus={() => setDraft(value)}
          onBlur={() => setDraft(null)}
          onChange={(e) => {
            const next = slugify(e.target.value);
            setDraft(next);
            if (!slugProblem(trim(next))) onCommit(trim(next));
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-2 font-mono text-[13px] outline-none"
        />
      </div>
      <p id="page-slug-hint" className={cn("text-[11px]", problem ? "text-hematite" : "text-ink-3")}>
        {problem ??
          (me.live
            ? "The board’s address. Rename the board in workspace settings to change it."
            : "Letters, numbers and hyphens. Old links keep redirecting after a change.")}
      </p>
    </>
  );
}

function LayoutSketch({ layout }: { layout: PageLayout }) {
  if (layout === "stages")
    return (
      <span className="grid h-10 w-full grid-cols-3 gap-1">
        {[3, 2, 1].map((n, i) => (
          <span key={i} className="flex flex-col gap-0.5 border border-line-strong p-0.5">
            {Array.from({ length: n }, (_, j) => (
              <span key={j} className="h-1.5 bg-ink-3/60" />
            ))}
          </span>
        ))}
      </span>
    );
  if (layout === "timeline")
    return (
      <span className="relative block h-10 w-full border border-line-strong">
        {[
          [4, 40],
          [24, 46],
          [44, 34],
          [10, 30],
        ].map(([l, w], i) => (
          <span
            key={i}
            className="absolute h-1.5 bg-ink-3/60"
            style={{ left: `${l}%`, width: `${w}%`, top: 4 + i * 8 }}
          />
        ))}
        <span className="absolute inset-y-0 left-1/2 w-px bg-pyrite" />
      </span>
    );
  return (
    <span className="flex h-10 w-full flex-col justify-between border border-line-strong p-1">
      {[90, 70, 55, 35].map((w, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="size-1.5 shrink-0 bg-ink-3" />
          <span className="h-1 bg-ink-3/60" style={{ width: `${w}%` }} />
        </span>
      ))}
    </span>
  );
}

function Customize({ state, dispatch }: { state: BoardState; dispatch: (a: DemoAction) => void }) {
  const page = state.roadmap.page;
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const set = (patch: Partial<PublicPage>) => dispatch({ type: "page", patch });
  const customNoun = !nouns.some(([one, many]) => one === page.ideaOne && many === page.ideaMany);
  const [custom, setCustom] = useState(customNoun);
  const url = publicPath(me.workspace, page.slug);

  return (
    <div className="flex h-full flex-col @4xl:flex-row">
      <aside className="shrink-0 overflow-y-auto border-line bg-surface @max-4xl:max-h-[45%] @max-4xl:border-b @4xl:w-[22rem] @4xl:border-r">
        <Group title="Page">
          <Setting label="Title" htmlFor="page-title">
            <Input id="page-title" value={page.title} onChange={(e) => set({ title: e.target.value })} />
          </Setting>
          <Setting label="Introduction" htmlFor="page-tagline">
            <Textarea
              id="page-tagline"
              value={page.tagline}
              onChange={(e) => set({ tagline: e.target.value })}
              className="min-h-20"
            />
          </Setting>
          <Setting label="Address" htmlFor="page-slug">
            <SlugField value={page.slug} onCommit={(slug) => set({ slug })} />
          </Setting>
        </Group>

        <Group title="Main view">
          <div role="radiogroup" aria-label="Main view" className="grid grid-cols-3 gap-2">
            {(
              [
                ["stages", "Stages", "Columns by stage"],
                ["timeline", "Timeline", "Your roadmap view"],
                ["list", "Ranked", "One list by votes"],
              ] as [PageLayout, string, string][]
            ).map(([id, label, hint]) => (
              <button
                key={id}
                role="radio"
                aria-checked={page.layout === id}
                onClick={() => set({ layout: id })}
                className={cn(
                  "flex flex-col gap-2 border p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-lapis",
                  page.layout === id ? "border-lapis bg-lapis-soft" : "border-line bg-raised hover:border-line-strong",
                )}
              >
                <LayoutSketch layout={id} />
                <span>
                  <span className="block text-xs font-medium">{label}</span>
                  <span className="block text-[10px] leading-tight text-ink-3">{hint}</span>
                </span>
              </button>
            ))}
          </div>
          {page.layout === "timeline" ? (
            <>
              <Setting label="Zoom">
                <Segmented
                  aria-label="Timeline zoom"
                  value={page.zoom}
                  onValueChange={(zoom) => set({ zoom })}
                  options={[
                    { value: "month", label: "Month" },
                    { value: "quarter", label: "Quarter" },
                    { value: "year", label: "Year" },
                  ]}
                />
              </Setting>
              <Setting label="Rows grouped by">
                <Segmented
                  aria-label="Group timeline rows by"
                  value={page.timelineGroup}
                  onValueChange={(timelineGroup) => set({ timelineGroup })}
                  options={[
                    { value: "stage", label: "Stage" },
                    { value: "project", label: "Project" },
                  ]}
                />
              </Setting>
            </>
          ) : (
            <Setting label="Order">
              <Segmented
                aria-label="Order items by"
                value={page.sort}
                onValueChange={(sort) => set({ sort })}
                options={[
                  { value: "votes", label: "Most votes" },
                  { value: "date", label: "Soonest" },
                ]}
              />
            </Setting>
          )}
        </Group>

        <Group title="Look">
          <Setting label="Accent">
            <div role="radiogroup" aria-label="Accent" className="flex gap-2">
              {(["lapis", "pyrite", "malachite", "hematite"] as Tone[]).map((tone) => (
                <Tooltip key={tone} content={cap(tone)}>
                  <button
                    role="radio"
                    aria-checked={page.accent === tone}
                    aria-label={cap(tone)}
                    onClick={() => set({ accent: tone })}
                    className={cn(
                      "grid size-9 place-items-center border outline-none focus-visible:ring-2 focus-visible:ring-lapis",
                      page.accent === tone ? "border-ink" : "border-line hover:border-line-strong",
                    )}
                  >
                    <Swatch value={tone} className="size-6" />
                  </button>
                </Tooltip>
              ))}
            </div>
          </Setting>
          <Setting label="Cover plate">
            <div role="radiogroup" aria-label="Cover plate" className="grid grid-cols-6 gap-1.5">
              <Tooltip content="No plate">
                <button
                  role="radio"
                  aria-checked={page.art === "none"}
                  aria-label="No plate"
                  onClick={() => set({ art: "none" })}
                  className={cn(
                    "grid aspect-square place-items-center border text-ink-3 outline-none focus-visible:ring-2 focus-visible:ring-lapis",
                    page.art === "none" ? "border-ink bg-raised" : "border-line bg-raised hover:border-line-strong",
                  )}
                >
                  <Icon name="x" size="sm" />
                </button>
              </Tooltip>
              {arts.map((a) => (
                <Tooltip key={a} content={a.replace(/-/g, " ")}>
                  <button
                    role="radio"
                    aria-checked={page.art === a}
                    aria-label={a.replace(/-/g, " ")}
                    onClick={() => set({ art: a })}
                    className={cn(
                      "relative aspect-square overflow-hidden border bg-raised outline-none focus-visible:ring-2 focus-visible:ring-lapis",
                      page.art === a ? "border-ink" : "border-line hover:border-line-strong",
                    )}
                  >
                    <Dither name={a} tone={page.art === a ? page.accent : "muted"} fill smooth className="m-0.5" />
                  </button>
                </Tooltip>
              ))}
            </div>
          </Setting>
        </Group>

        <Group
          title="Stage names"
          action={
            JSON.stringify(page.stageNames) !== JSON.stringify(defaultPage.stageNames) ? (
              <button
                onClick={() => set({ stageNames: defaultPage.stageNames })}
                className="text-[11px] text-ink-3 hover:text-ink"
              >
                Reset
              </button>
            ) : null
          }
        >
          {stageIds.map((id) => (
            <div key={id} className="flex items-center gap-2.5">
              <StatusMarker status={stageMeta[id].marker} />
              <Input
                aria-label={`Name for ${defaultPage.stageNames[id]}`}
                value={page.stageNames[id]}
                placeholder={defaultPage.stageNames[id]}
                onChange={(e) =>
                  set({
                    stageNames: { ...page.stageNames, [id]: e.target.value },
                  })
                }
                className="h-8"
              />
            </div>
          ))}
        </Group>

        <Group title={cap(page.ideaMany)}>
          <Toggle
            label={`Take ${page.ideaMany}`}
            hint="Visitors can send them to you."
            checked={page.ideas}
            onChange={(ideas) => set({ ideas })}
          />
          <Setting label="Call them">
            <div className="flex flex-wrap gap-1.5">
              {nouns.map(([one, many]) => {
                const on = !custom && page.ideaOne === one && page.ideaMany === many;
                return (
                  <button
                    key={one}
                    aria-pressed={on}
                    onClick={() => {
                      setCustom(false);
                      set({ ideaOne: one, ideaMany: many });
                    }}
                    className={cn(
                      "h-7 border px-2 text-xs",
                      on
                        ? "border-lapis bg-lapis-soft text-lapis-ink"
                        : "border-line bg-raised text-ink-2 hover:border-line-strong hover:text-ink",
                    )}
                  >
                    {cap(many)}
                  </button>
                );
              })}
              <button
                aria-pressed={custom}
                onClick={() => setCustom(true)}
                className={cn(
                  "h-7 border px-2 text-xs",
                  custom
                    ? "border-lapis bg-lapis-soft text-lapis-ink"
                    : "border-dashed border-line-strong text-ink-3 hover:text-ink",
                )}
              >
                Your own…
              </button>
            </div>
            {custom ? (
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Input
                  aria-label="One"
                  placeholder="pitch"
                  value={page.ideaOne}
                  onChange={(e) => set({ ideaOne: e.target.value.toLowerCase() })}
                  className="h-8"
                />
                <Input
                  aria-label="Many"
                  placeholder="pitches"
                  value={page.ideaMany}
                  onChange={(e) => set({ ideaMany: e.target.value.toLowerCase() })}
                  className="h-8"
                />
              </div>
            ) : null}
          </Setting>
          <Setting label="Prompt" htmlFor="page-prompt" hint="The placeholder in the form.">
            <Input id="page-prompt" value={page.ideaPrompt} onChange={(e) => set({ ideaPrompt: e.target.value })} />
          </Setting>
          <Toggle
            label={`Show ${page.ideaMany} in public`}
            hint="Others can read and vote on them before you decide."
            checked={page.ideasPublic}
            onChange={(ideasPublic) => set({ ideasPublic })}
          />
        </Group>

        <Group title="Show">
          <Toggle
            label="Voting"
            hint="Visitors can vote on items."
            checked={page.voting}
            onChange={(voting) => set({ voting })}
          />
          <Toggle
            label="Shipped work"
            hint="A changelog of what’s done."
            checked={page.showShipped}
            onChange={(showShipped) => set({ showShipped })}
          />
          <Toggle
            label="Target dates"
            hint="When you expect to ship."
            checked={page.showDates}
            onChange={(showDates) => set({ showDates })}
          />
          <Toggle
            label="Progress"
            hint="Subtasks done, as a meter."
            checked={page.showProgress}
            onChange={(showProgress) => set({ showProgress })}
          />
          <Toggle
            label="Who’s on it"
            hint="Your team’s avatars."
            checked={page.showTeam}
            onChange={(showTeam) => set({ showTeam })}
          />
        </Group>

        <Group
          title="Your brand"
          action={
            <span className="flex items-center gap-1 border border-line px-1.5 py-px font-mono text-[10px] text-ink-3">
              <Icon name="lock" size="sm" /> Enterprise
            </span>
          }
        >
          <Setting label="Custom domain" htmlFor="page-domain" hint="Serve this page from your own domain.">
            <Input id="page-domain" disabled placeholder="roadmap.yourco.com" className="font-mono text-[13px]" />
          </Setting>
          <Toggle
            label="“Made with Acta” footer"
            hint="Enterprise pages can drop it."
            checked
            disabled
            onChange={() => {}}
          />
        </Group>

        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-[11px] text-ink-3">Changes save as you go. ⌘Z undoes them.</span>
          <button
            onClick={() => {
              setCustom(false);
              dispatch({ type: "page", patch: defaultPage });
            }}
            className="text-[11px] text-ink-3 hover:text-hematite"
          >
            Reset page
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sunken/40">
        <div className="hidden shrink-0 items-center gap-3 border-b border-line px-3 py-2 @4xl:flex">
          <span className="text-xs text-ink-3">Live preview</span>
          <Segmented
            aria-label="Preview size"
            value={device}
            onValueChange={setDevice}
            options={[
              { value: "desktop", label: "Desktop" },
              { value: "phone", label: "Phone" },
            ]}
            className="ml-auto w-44"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 @xl:p-5">
          <div
            className={cn(
              "mx-auto transition-[max-width] duration-300",
              device === "phone" ? "max-w-[390px]" : "max-w-5xl",
            )}
          >
            <Frame url={url} phone={device === "phone"}>
              <Visitor state={state} dispatch={dispatch} />
            </Frame>
          </div>
        </div>
      </div>
    </div>
  );
}

function Frame({ url, phone, children }: { url: string; phone?: boolean; children: React.ReactNode }) {
  return (
    <DitherShadow offset={6} className="mx-auto max-w-5xl">
      <div className="@container border border-ink bg-page">
        <div className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2">
          {phone ? null : (
            <span className="flex gap-1.5" aria-hidden>
              <span className="size-2.5 border border-line-strong" />
              <span className="size-2.5 border border-line-strong" />
              <span className="size-2.5 border border-line-strong" />
            </span>
          )}
          <span
            className={cn(
              "flex h-7 min-w-0 flex-1 items-center gap-2 border border-line bg-raised px-2 font-mono text-[11px] text-ink-2",
              !phone && "sm:max-w-sm",
            )}
          >
            <Icon name="lock" size="sm" className="text-ink-3" />
            <span className="truncate">{url}</span>
          </span>
        </div>
        {children}
      </div>
    </DitherShadow>
  );
}

function VoteButton({
  task,
  accent,
  onVote,
  size = "md",
}: {
  task: Pick<Task, "title" | "votes" | "voted">;
  accent: Tone;
  onVote: () => void;
  size?: "sm" | "md";
}) {
  const t = tint[accent];
  return (
    <button
      aria-pressed={!!task.voted}
      aria-label={`Vote for ${task.title}`}
      onClick={(e) => {
        e.stopPropagation();
        onVote();
      }}
      className={cn(
        "flex shrink-0 flex-col items-center justify-center border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-page",
        size === "md" ? "h-11 w-11" : "h-7 w-9 flex-row gap-0.5",
        task.voted ? t.solid : cn("border-line-strong bg-raised text-ink-2 hover:text-ink", t.hover),
        t.ring,
      )}
    >
      <Icon name="chevron-up" size="sm" />
      <span className="font-mono text-[11px] leading-none">{task.votes ?? 0}</span>
    </button>
  );
}

function Progress({ task, accent }: { task: Task; accent: Tone }) {
  const total = task.subtasks.length;
  if (!total) return null;
  const done = task.subtasks.filter((s) => s.done).length;
  return (
    <Tooltip content={`${done} of ${total} steps done`}>
      <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-3">
        <span className="flex gap-px">
          {task.subtasks.map((s) => (
            <span key={s.id} className={cn("h-2 w-1.5", s.done ? tint[accent].bg : "bg-line-strong")} />
          ))}
        </span>
        {Math.round((done / total) * 100)}%
      </span>
    </Tooltip>
  );
}

export function Visitor({
  state,
  dispatch,
  home,
}: {
  state: BoardState;
  dispatch: (a: DemoAction) => void;
  home?: string;
}) {
  const page = state.roadmap.page;
  const today = useToday();
  const now = useNow();
  const t = tint[page.accent];
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<Stage | "all">("all");
  const [ideaSort, setIdeaSort] = useState<"top" | "new">("top");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);

  const q = query.trim().toLowerCase();
  const all = Object.values(state.tasks).filter((x) => x.public && (page.showShipped || stageOf(x) !== "shipped"));
  const items = all.filter((x) => !q || x.title.toLowerCase().includes(q) || x.description.toLowerCase().includes(q));
  const max = Math.max(1, ...all.map((x) => x.votes ?? 0));
  const order = page.sort === "date" ? byDue : byVotes;
  const stages = stageIds.filter((s) => page.showShipped || s !== "shipped");
  const vote = (id: string) => dispatch({ type: "vote", id });
  const open = detail ? state.tasks[detail] : null;
  const ranked = items.filter((x) => (only === "all" ? stageOf(x) !== "shipped" : stageOf(x) === only)).sort(order);
  const ideas = [...state.roadmap.suggestions].sort(
    ideaSort === "top" ? (a, b) => b.votes - a.votes : (a, b) => b.at - a.at,
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    dispatch({
      type: "suggest",
      title: title.trim(),
      details: details.trim() || undefined,
    });
    setTitle("");
    setDetails("");
    toast({
      icon: "bulb",
      title: `Thanks for the ${page.ideaOne}`,
      description: page.ideasPublic ? "It’s up for votes below, and the team will see it." : "The team will see it.",
    });
  };

  if (!state.roadmap.public)
    return (
      <EmptyState
        art="cave-kingston-stalactite"
        title="This roadmap is private"
        body={`${me.team} hasn’t opened it to visitors yet.`}
        className="py-16"
      />
    );

  const meta = (x: Task) => {
    const person = personById(x.assignee);
    const shipped = stageOf(x) === "shipped";
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {page.showDates && shipped && x.shipped ? (
          <span className="flex items-center gap-1 font-mono text-[11px] text-malachite">
            <Icon name="check" size="sm" /> {formatShort(x.shipped, today)}
          </span>
        ) : page.showDates && x.due ? (
          <span className="flex items-center gap-1 font-mono text-[11px] text-ink-3">
            <Icon name="flag" size="sm" /> {formatShort(x.due, today)}
          </span>
        ) : null}
        {page.showProgress && !shipped ? <Progress task={x} accent={page.accent} /> : null}
        {page.showTeam && person ? (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <Avatar name={person.name} src={person.avatar} tone={person.tone} size="xs" />
            {person.name.split(" ")[0]}
          </span>
        ) : null}
      </span>
    );
  };

  const item = (x: Task, stage: Stage) => (
    <li key={x.id} className="flex gap-3 border-b border-line py-3 last:border-b-0">
      {page.voting ? <VoteButton task={x} accent={page.accent} onVote={() => vote(x.id)} /> : null}
      <div className="min-w-0 flex-1">
        <button
          onClick={() => setDetail(x.id)}
          className={cn("text-left text-sm leading-snug outline-none hover:underline focus-visible:ring-2", t.ring)}
        >
          {x.title}
        </button>
        {note(x) ? <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{note(x)}</p> : null}
        <div className="mt-1.5">{meta(x)}</div>
        {page.voting ? (
          <div className="mt-2">
            <Vein
              votes={x.votes ?? 0}
              max={max}
              tone={stage === "shipped" ? "malachite" : (page.accent as DitherTone)}
            />
          </div>
        ) : null}
      </div>
    </li>
  );

  const timelineGroups =
    page.timelineGroup === "stage"
      ? stages.map((s) => ({
          key: `p:${s}`,
          title: page.stageNames[s],
          icon: <StatusMarker status={stageMeta[s].marker} />,
          rows: items.filter((x) => stageOf(x) === s && (x.start || x.due)),
        }))
      : [...new Set(items.map((x) => x.project ?? "Other"))].sort().map((p) => ({
          key: `p:${p}`,
          title: p,
          icon: <ProjectMark project={p === "Other" ? undefined : p} />,
          rows: items.filter((x) => (x.project ?? "Other") === p && (x.start || x.due)),
        }));

  return (
    <div className="px-4 py-8 @2xl:px-10 @2xl:py-10">
      <div className="grid gap-6 @2xl:grid-cols-[1fr_auto] @2xl:items-center">
        <div className="min-w-0">
          <Eyebrow>{me.team} · Roadmap</Eyebrow>
          <h1 className="mt-3 font-display text-3xl leading-tight break-words @2xl:text-4xl">
            {page.title || "Untitled"}
          </h1>
          {page.tagline ? <p className="mt-2 max-w-lg text-sm text-ink-2">{page.tagline}</p> : null}
          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-3 font-mono text-[11px] text-ink-3">
            {stages.map((s) => (
              <div key={s}>
                <dt className="flex items-center gap-1.5">
                  <StatusMarker status={stageMeta[s].marker} className="size-2.5" />
                  {page.stageNames[s]}
                </dt>
                <dd className="mt-1 font-display text-2xl text-ink">{all.filter((x) => stageOf(x) === s).length}</dd>
              </div>
            ))}
          </dl>
        </div>
        {arts.includes(page.art as DitherName) ? (
          <div className="relative hidden h-44 w-56 @2xl:block">
            <Dither name={page.art as DitherName} tone={page.accent} fill smooth />
          </div>
        ) : null}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <label
          className={cn(
            "flex h-9 min-w-0 flex-1 items-center gap-2 border border-line-strong bg-raised px-2.5 focus-within:border-ink @2xl:max-w-xs",
          )}
        >
          <Icon name="search" size="sm" className="text-ink-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the roadmap"
            aria-label="Search the roadmap"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
          {query ? (
            <button aria-label="Clear search" onClick={() => setQuery("")} className="text-ink-3 hover:text-ink">
              <Icon name="x" size="sm" />
            </button>
          ) : null}
        </label>
        {page.layout === "list" ? (
          <div role="radiogroup" aria-label="Show stage" className="flex flex-wrap gap-1">
            {(["all", ...stages] as (Stage | "all")[]).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={only === s}
                onClick={() => setOnly(s)}
                className={cn(
                  "flex h-9 items-center gap-1.5 border px-2.5 text-xs outline-none focus-visible:ring-2",
                  t.ring,
                  only === s ? t.soft : "border-line bg-raised text-ink-2 hover:border-line-strong",
                )}
              >
                {s === "all" ? (
                  "Open"
                ) : (
                  <>
                    <StatusMarker status={stageMeta[s].marker} className="size-2.5" />
                    {page.stageNames[s]}
                  </>
                )}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {page.layout === "stages" ? (
        <div className="mt-6 grid gap-6 @2xl:grid-cols-2">
          {stages
            .filter((s) => s !== "shipped")
            .map((s) => {
              const list = items.filter((x) => stageOf(x) === s).sort(order);
              return (
                <section key={s}>
                  <header className="flex items-center gap-2 border-b border-ink pb-2">
                    <StatusMarker status={stageMeta[s].marker} />
                    <h2 className="text-sm font-medium">{page.stageNames[s]}</h2>
                    <span className="font-mono text-[11px] text-ink-3">{list.length}</span>
                  </header>
                  <ul>
                    {list.map((x) => item(x, s))}
                    {list.length === 0 ? (
                      <li className="py-6 text-center text-xs text-ink-3">
                        {q ? "Nothing matches" : "Nothing here yet"}
                      </li>
                    ) : null}
                  </ul>
                </section>
              );
            })}
        </div>
      ) : page.layout === "timeline" ? (
        <div className="mt-6 h-[30rem] border border-line-strong bg-raised">
          <TimelineView
            state={state}
            dispatch={dispatch}
            visible={() => true}
            onOpen={setDetail}
            prefs={{ grouping: "none", zoom: zoom ?? page.zoom, collapsed }}
            setPrefs={(p) => {
              if (p.zoom) setZoom(p.zoom);
              if (p.collapsed) setCollapsed(p.collapsed);
            }}
            filtered={Boolean(q)}
            onClearFilters={() => setQuery("")}
            readOnly
            accent={page.accent}
            customGroups={timelineGroups}
            lead={
              page.voting
                ? (x) => <VoteButton task={x} accent={page.accent} onVote={() => vote(x.id)} size="sm" />
                : undefined
            }
          />
        </div>
      ) : (
        <ol className="mt-6 border-t border-ink">
          {ranked.map((x, i) => {
            const s = stageOf(x);
            return (
              <li key={x.id} className="flex items-start gap-3 border-b border-line py-3">
                <span className="w-6 shrink-0 pt-3 text-right font-mono text-[11px] text-ink-3">{i + 1}</span>
                {page.voting ? <VoteButton task={x} accent={page.accent} onVote={() => vote(x.id)} /> : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <button
                      onClick={() => setDetail(x.id)}
                      className={cn("text-left text-sm outline-none hover:underline focus-visible:ring-2", t.ring)}
                    >
                      {x.title}
                    </button>
                    <span className="flex items-center gap-1 border border-line px-1.5 py-px text-[10px] text-ink-2">
                      <StatusMarker status={stageMeta[s].marker} className="size-2" />
                      {page.stageNames[s]}
                    </span>
                  </div>
                  {note(x) ? <p className="mt-0.5 line-clamp-1 text-xs text-ink-3">{note(x)}</p> : null}
                  <div className="mt-1.5">{meta(x)}</div>
                </div>
              </li>
            );
          })}
          {ranked.length === 0 ? (
            <li className="py-8 text-center text-xs text-ink-3">{q ? "Nothing matches" : "Nothing here yet"}</li>
          ) : null}
        </ol>
      )}

      {page.ideas || (page.ideasPublic && ideas.length) ? (
        <section className="mt-12 grid gap-8 @3xl:grid-cols-[minmax(0,20rem)_1fr]">
          {page.ideas ? (
            <form onSubmit={submit} className="self-start border border-ink bg-raised p-4">
              <h2 className="font-display text-xl">
                {cap(article(page.ideaOne))} {page.ideaOne}?
              </h2>
              <p className="mt-1 text-xs text-ink-3">The team reads every one.</p>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={page.ideaPrompt}
                aria-label={`Your ${page.ideaOne}`}
                className="mt-4"
              />
              {title.trim() ? (
                <Textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Any details? Optional."
                  aria-label="Details"
                  className="mt-2 min-h-20"
                />
              ) : null}
              <Button
                type="submit"
                variant="primary"
                disabled={!title.trim()}
                className={cn("mt-3 w-full", t.solid, "hover:opacity-90")}
              >
                <Icon name="bulb" /> Send {page.ideaOne}
              </Button>
            </form>
          ) : null}
          {page.ideasPublic ? (
            <div className="min-w-0">
              <header className="flex items-center gap-2 border-b border-ink pb-2">
                <Icon name="bulb" size="sm" className={t.text} />
                <h2 className="text-sm font-medium">{cap(page.ideaMany)} from visitors</h2>
                <span className="font-mono text-[11px] text-ink-3">{ideas.length}</span>
                <div role="radiogroup" aria-label="Sort" className="ml-auto flex border border-line">
                  {(["top", "new"] as const).map((s) => (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={ideaSort === s}
                      onClick={() => setIdeaSort(s)}
                      className={cn(
                        "h-6 px-2 text-[11px] capitalize",
                        ideaSort === s ? "bg-ink text-page" : "text-ink-2 hover:bg-sunken",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </header>
              <ul>
                {ideas.map((s: Suggestion) => (
                  <li key={s.id} className="flex gap-3 border-b border-line py-3">
                    {page.voting ? (
                      <VoteButton
                        task={{
                          title: s.title,
                          votes: s.votes,
                          voted: s.voted,
                        }}
                        accent={page.accent}
                        onVote={() => dispatch({ type: "voteSuggestion", id: s.id })}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{s.title}</p>
                      {s.details ? <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{s.details}</p> : null}
                      <p className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-3">
                        <span className="border border-dashed border-line-strong px-1.5 py-px">Under review</span>
                        {s.by}
                        {now ? ` · ${timeAgo(s.at, now)}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
                {ideas.length === 0 ? (
                  <li className="py-8 text-center text-xs text-ink-3">No {page.ideaMany} yet. Be the first.</li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {page.showShipped && page.layout === "stages" ? (
        <section className="mt-12">
          <header className="flex items-center gap-2 border-b border-ink pb-2">
            <StatusMarker status="done" />
            <h2 className="text-sm font-medium">{page.stageNames.shipped}</h2>
          </header>
          <ol className="relative mt-4 ml-1.5 border-l border-line-strong">
            {items
              .filter((x) => stageOf(x) === "shipped")
              .sort(byShipped)
              .map((x) => (
                <li key={x.id} className="relative pb-5 pl-5 last:pb-0">
                  <span className="absolute top-1 -left-[5px] size-[9px] border border-malachite bg-malachite" />
                  {page.showDates && x.shipped ? (
                    <p className="font-mono text-[11px] text-ink-3">{formatShort(x.shipped, null)}</p>
                  ) : null}
                  <button
                    onClick={() => setDetail(x.id)}
                    className="mt-0.5 flex items-center gap-2 text-left text-sm hover:underline"
                  >
                    {x.title}
                    {x.project ? <ProjectMark project={x.project} /> : null}
                  </button>
                  {page.voting ? (
                    <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                      {x.votes ?? 0} {x.votes === 1 ? "person" : "people"} asked for this
                    </p>
                  ) : null}
                </li>
              ))}
          </ol>
        </section>
      ) : null}

      <p className="mt-12 border-t border-line pt-4 font-mono text-[11px] text-ink-3">
        {home ? (
          <a href={home} className="inline-flex items-center gap-2 hover:text-ink">
            <LogoMark size={14} /> Made with Acta
          </a>
        ) : (
          <span className="inline-flex items-center gap-2">
            <LogoMark size={14} /> Made with Acta
          </span>
        )}
      </p>

      <D.Root open={Boolean(open)} onOpenChange={(o) => !o && setDetail(null)}>
        {open ? (
          <DialogContent title={open.title} className="max-w-xl">
            {(() => {
              const s = stageOf(open);
              return (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1.5 border border-line px-2 py-0.5 text-xs text-ink-2">
                      <StatusMarker status={stageMeta[s].marker} className="size-2.5" />
                      {page.stageNames[s]}
                    </span>
                    {meta(open)}
                  </div>
                  {open.description ? (
                    <Markdown source={open.description} />
                  ) : (
                    <p className="text-sm text-ink-3">No details yet.</p>
                  )}
                  {page.showProgress && open.subtasks.length && s !== "shipped" ? (
                    <div>
                      <p className="mb-1.5 text-[11px] text-ink-3">Progress</p>
                      <div className="flex h-2 gap-px">
                        {open.subtasks.map((st) => (
                          <span key={st.id} className={cn("flex-1", st.done ? tint[page.accent].bg : "bg-line")} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {page.voting ? (
                    <div className="flex items-center gap-3 border-t border-line pt-4">
                      <VoteButton task={open} accent={page.accent} onVote={() => vote(open.id)} />
                      <p className="text-sm text-ink-2">
                        {open.voted ? "You voted for this." : "Want this? Give it a vote."}
                        <span className="block font-mono text-[11px] text-ink-3">
                          {open.votes ?? 0} {open.votes === 1 ? "vote" : "votes"} so far
                        </span>
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })()}
          </DialogContent>
        ) : null}
      </D.Root>
    </div>
  );
}
