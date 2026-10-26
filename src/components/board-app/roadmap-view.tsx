"use client";

import { useState } from "react";
import { StatusMarker } from "@/components/markers";
import { Combobox } from "@/components/ui/combobox";
import { Segmented, Switch } from "@/components/ui/controls";
import { Swatch } from "@/components/ui/color-picker";
import { Dither, DitherFill, DitherShadow } from "@/components/ui/dither";
import { EmptyState } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Input, Textarea } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { useNow } from "@/lib/hooks";
import { MONTHS } from "@/lib/dates";
import {
  defaultPage,
  formatDue,
  me,
  nextTaskId,
  stageOf,
  statusTitle,
  timeAgo,
  type BoardState,
  type PageLayout,
  type PublicPage,
  type Task,
  type Tone,
} from "@/lib/board-store";
import { boardSlugProblem, publicHost, publicHref, publicPath, SLUG_MAX, slugify } from "@/lib/slugs";
import { cn } from "@/lib/utils";
import type { DemoAction } from "./demo-state";
import { arts, byShipped, byVotes, cap, stageIds, stageMeta, Vein, Visitor } from "./roadmap-page";

const nouns: [string, string][] = [
  ["idea", "ideas"],
  ["suggestion", "suggestions"],
  ["request", "requests"],
  ["wish", "wishes"],
  ["feedback", "feedback"],
];

const month = (iso?: string) => {
  if (!iso) return "Earlier";
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
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
                          const id = nextTaskId(state);
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
  const problem = draft === null ? null : boardSlugProblem(trim(draft));
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
            if (!boardSlugProblem(trim(next))) onCommit(trim(next));
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-2 font-mono text-[13px] outline-none"
        />
      </div>
      <p id="page-slug-hint" className={cn("text-[11px]", problem ? "text-hematite" : "text-ink-3")}>
        {problem ??
          (me.live
            ? "The board’s address. Change it under Edit in workspace settings."
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
