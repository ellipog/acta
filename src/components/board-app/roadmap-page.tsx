"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Dialog as D } from "radix-ui";
import { ProjectMark, StatusMarker } from "@/components/markers";
import { Button } from "@/components/ui/button";
import { formatShort, useToday } from "@/components/ui/date-picker";
import { Dither, DitherFill, type DitherTone } from "@/components/ui/dither";
import { Avatar, EmptyState, Eyebrow } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { LogoMark } from "@/components/ui/logo-mark";
import { Input, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { DialogContent } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { useNow } from "@/lib/hooks";
import { MONTHS } from "@/lib/dates";
import type { DitherName } from "@/lib/dither-assets";
import {
  me,
  pageCss,
  personById,
  safeHref,
  stageOf,
  timeAgo,
  type BoardState,
  type PageSection,
  type PublicPage,
  type Stage,
  type StatusCategory,
  type Suggestion,
  type Task,
  type Tone,
} from "@/lib/board-store";
import { cn } from "@/lib/utils";
import type { DemoAction } from "./demo-state";
import type { Zoom } from "./fields";
import { PageFrame } from "./page-frame";

// The page visitors see. It lives apart from the roadmap editor so the public page doesn't download the editor,
// and the timeline only loads for pages laid out as one
const TimelineView = dynamic(() => import("./timeline-view").then((m) => m.TimelineView));

export const stageMeta: Record<Stage, { marker: StatusCategory; tone: DitherTone }> = {
  planned: { marker: "todo", tone: "lapis" },
  progress: { marker: "in_progress", tone: "pyrite" },
  shipped: { marker: "done", tone: "malachite" },
};
export const stageIds: Stage[] = ["planned", "progress", "shipped"];

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

export const arts: DitherName[] = [
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

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const headingFonts: Record<PublicPage["headingFont"], string> = {
  display: "font-display",
  sans: "font-sans font-semibold tracking-tight",
  serif: "font-caption italic",
  mono: "font-mono tracking-tight",
};

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * A page's own colour, worn in place of lapis. The softer and deeper shades are mixed from it against the page
 * itself, so they suit light and dark alike, and text on it turns dark when the colour is light
 */
export function accentVars(hex: string): React.CSSProperties | undefined {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const [r, g, b] = [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4;
  return {
    "--lapis": hex,
    "--lapis-hover": `color-mix(in oklab, ${hex} 85%, var(--ink))`,
    "--lapis-soft": `color-mix(in oklab, ${hex} 16%, var(--raised))`,
    "--lapis-ink": `color-mix(in oklab, ${hex} 65%, var(--ink))`,
    "--on-accent": light ? "#11131a" : "#f7f5ef",
  } as React.CSSProperties;
}

/** The accent the page's parts use: lapis carries a colour of the page's own */
export const accentOf = (page: PublicPage): Tone => (page.color ? "lapis" : page.accent);

const monthOf = (iso?: string) => {
  if (!iso) return "Earlier";
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

const outside = { target: "_blank", rel: "noopener noreferrer nofollow" } as const;
const article = (s: string) => (/^[aeiou]/i.test(s) ? "an" : "a");
export const byVotes = (a: Task, b: Task) => (b.votes ?? 0) - (a.votes ?? 0);
const byDue = (a: Task, b: Task) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || byVotes(a, b);
export const byShipped = (a: Task, b: Task) => (b.shipped ?? "").localeCompare(a.shipped ?? "");
const note = (t: Task) => t.description.split(/(?<=\.)\s/)[0] || (t.project ? `Part of ${t.project}` : "");

export function Vein({ votes, max, tone }: { votes: number; max: number; tone: DitherTone }) {
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
  const accent = accentOf(page);
  const t = tint[accent];
  const compact = page.density === "compact";
  const heading = headingFonts[page.headingFont] ?? headingFonts.display;
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<Stage | "all">("all");
  const [ideaSort, setIdeaSort] = useState<"top" | "new">("top");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [allShipped, setAllShipped] = useState(false);

  const q = query.trim().toLowerCase();
  const all = Object.values(state.tasks).filter(
    (x) => x.public && x.status !== "canceled" && (page.showShipped || stageOf(x) !== "shipped"),
  );
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
  const ctaHref = page.cta.label.trim() ? safeHref(page.cta.url) : null;
  const links = page.links.flatMap((l) => {
    const href = safeHref(l.url);
    return href && l.label.trim() ? [{ label: l.label, href }] : [];
  });
  const announcementHref = safeHref(page.announcementLink);
  const art = page.hero !== "plain" && arts.includes(page.art as DitherName) ? (page.art as DitherName) : null;

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
        {page.showProjects && x.project ? <ProjectMark project={x.project} /> : null}
        {page.showProgress && !shipped ? <Progress task={x} accent={accent} /> : null}
        {page.showTeam && person ? (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <Avatar name={person.name} src={person.avatar} tone={person.tone} size="xs" />
            {person.name.split(" ")[0]}
          </span>
        ) : null}
      </span>
    );
  };

  const voteSize = compact ? "sm" : "md";

  const item = (x: Task, stage: Stage) => (
    <li key={x.id} className={cn("flex gap-3 border-b border-line last:border-b-0", compact ? "py-2" : "py-3")}>
      {page.voting ? <VoteButton task={x} accent={accent} onVote={() => vote(x.id)} size={voteSize} /> : null}
      <div className="min-w-0 flex-1">
        <button
          onClick={() => setDetail(x.id)}
          className={cn("text-left text-sm leading-snug outline-none hover:underline focus-visible:ring-2", t.ring)}
        >
          {x.title}
        </button>
        {page.showNotes && note(x) ? <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{note(x)}</p> : null}
        <div className={compact ? "mt-1" : "mt-1.5"}>{meta(x)}</div>
        {page.voting && !compact ? (
          <div className="mt-2">
            <Vein votes={x.votes ?? 0} max={max} tone={stage === "shipped" ? "malachite" : (accent as DitherTone)} />
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

  const stats = page.showStats ? (
    <dl
      className={cn(
        "mt-5 flex flex-wrap gap-x-6 gap-y-3 font-mono text-[11px] text-ink-3",
        page.hero === "centered" && "justify-center",
      )}
    >
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
  ) : null;

  const actions =
    ctaHref || links.length ? (
      <div className={cn("mt-5 flex flex-wrap items-center gap-2", page.hero === "centered" && "justify-center")}>
        {ctaHref ? (
          <a
            href={ctaHref}
            {...outside}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 border px-3 text-sm outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-page",
              t.solid,
              t.ring,
            )}
          >
            {page.cta.label} <Icon name="arrow-right" size="sm" />
          </a>
        ) : null}
        {links.map((l) => (
          <a
            key={l.href + l.label}
            href={l.href}
            {...outside}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 border border-line bg-raised px-3 text-sm text-ink-2 outline-none hover:border-line-strong hover:text-ink focus-visible:ring-2",
              t.ring,
            )}
          >
            {l.label} <Icon name="external" size="sm" className="text-ink-3" />
          </a>
        ))}
      </div>
    ) : null;

  const words = (
    <>
      <Eyebrow>{me.team} · Roadmap</Eyebrow>
      <h1
        className={cn(
          "mt-3 leading-tight break-words",
          heading,
          page.hero === "plain" ? "text-2xl @2xl:text-3xl" : "text-3xl @2xl:text-4xl",
        )}
      >
        {page.title || "Untitled"}
      </h1>
      {page.tagline ? (
        <p className={cn("mt-2 max-w-lg text-sm text-ink-2", page.hero === "centered" && "mx-auto")}>{page.tagline}</p>
      ) : null}
      {actions}
      {stats}
    </>
  );

  const hero =
    page.hero === "banner" ? (
      <div>
        {art ? (
          <div
            className={cn(
              "relative -mx-4 h-36 overflow-hidden border-b border-line @2xl:-mx-10 @2xl:h-48",
              compact ? "-mt-6 mb-6 @2xl:-mt-8" : "-mt-8 mb-8 @2xl:-mt-10",
            )}
          >
            <Dither name={art} tone={accent} fill smooth />
          </div>
        ) : null}
        <div className="min-w-0">{words}</div>
      </div>
    ) : page.hero === "centered" ? (
      <div className="flex flex-col items-center text-center">
        {art ? (
          <div className="relative mb-2 h-24 w-28">
            <Dither name={art} tone={accent} fill smooth />
          </div>
        ) : null}
        <div className="min-w-0">{words}</div>
      </div>
    ) : (
      <div className="grid gap-6 @2xl:grid-cols-[1fr_auto] @2xl:items-center">
        <div className="min-w-0">{words}</div>
        {art ? (
          <div className="relative hidden h-44 w-56 @2xl:block">
            <Dither name={art} tone={accent} fill smooth />
          </div>
        ) : null}
      </div>
    );

  const toolbar =
    page.showSearch || page.layout === "list" ? (
      <div className="flex flex-wrap items-center gap-2">
        {page.showSearch ? (
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 border border-line-strong bg-raised px-2.5 focus-within:border-ink @2xl:max-w-xs">
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
        ) : null}
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
    ) : null;

  const roadmap = (
    <div className="flex flex-col gap-6">
      {toolbar}
      {page.layout === "stages" ? (
        <div className="grid gap-6 @2xl:grid-cols-2">
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
        <div className="h-[30rem] border border-line-strong bg-raised">
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
            accent={accent}
            customGroups={timelineGroups}
            lead={
              page.voting
                ? (x) => <VoteButton task={x} accent={accent} onVote={() => vote(x.id)} size="sm" />
                : undefined
            }
          />
        </div>
      ) : (
        <ol className="border-t border-ink">
          {ranked.map((x, i) => {
            const s = stageOf(x);
            return (
              <li key={x.id} className={cn("flex items-start gap-3 border-b border-line", compact ? "py-2" : "py-3")}>
                <span className={cn("w-6 shrink-0 text-right font-mono text-[11px] text-ink-3", compact ? "pt-1.5" : "pt-3")}>
                  {i + 1}
                </span>
                {page.voting ? <VoteButton task={x} accent={accent} onVote={() => vote(x.id)} size={voteSize} /> : null}
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
                  {page.showNotes && note(x) ? <p className="mt-0.5 line-clamp-1 text-xs text-ink-3">{note(x)}</p> : null}
                  <div className={compact ? "mt-1" : "mt-1.5"}>{meta(x)}</div>
                </div>
              </li>
            );
          })}
          {ranked.length === 0 ? (
            <li className="py-8 text-center text-xs text-ink-3">{q ? "Nothing matches" : "Nothing here yet"}</li>
          ) : null}
        </ol>
      )}
    </div>
  );

  const ideasBlock =
    page.ideas || (page.ideasPublic && ideas.length) ? (
      <section className="grid gap-8 @3xl:grid-cols-[minmax(0,20rem)_1fr]">
        {page.ideas ? (
          <form onSubmit={submit} className="self-start border border-ink bg-raised p-4">
            <h2 className={cn("text-xl", heading)}>
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
                <li key={s.id} className={cn("flex gap-3 border-b border-line", compact ? "py-2" : "py-3")}>
                  {page.voting ? (
                    <VoteButton
                      task={{ title: s.title, votes: s.votes, voted: s.voted }}
                      accent={accent}
                      onVote={() => dispatch({ type: "voteSuggestion", id: s.id })}
                      size={voteSize}
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
    ) : null;

  const shippedAll = items.filter((x) => stageOf(x) === "shipped").sort(byShipped);
  const limit = page.shippedLimit > 0 && !allShipped ? page.shippedLimit : shippedAll.length;
  const shippedShown = shippedAll.slice(0, limit);
  const shippedGroups = page.shippedByMonth
    ? [...new Set(shippedShown.map((x) => monthOf(x.shipped)))].map((m) => ({
        month: m,
        rows: shippedShown.filter((x) => monthOf(x.shipped) === m),
      }))
    : [{ month: "", rows: shippedShown }];

  const shippedBlock =
    page.showShipped && page.layout !== "list" && shippedAll.length ? (
      <section>
        <header className="flex items-center gap-2 border-b border-ink pb-2">
          <StatusMarker status="done" />
          <h2 className="text-sm font-medium">{page.stageNames.shipped}</h2>
          <span className="font-mono text-[11px] text-ink-3">{shippedAll.length}</span>
        </header>
        {shippedGroups.map((g) => (
          <div key={g.month || "all"}>
            {g.month ? <p className="mt-5 font-mono text-[11px] tracking-[0.1em] text-ink-3 uppercase">{g.month}</p> : null}
            <ol className={cn("relative ml-1.5 border-l border-line-strong", g.month ? "mt-2" : "mt-4")}>
              {g.rows.map((x) => (
                <li key={x.id} className={cn("relative pl-5 last:pb-0", compact ? "pb-3" : "pb-5")}>
                  <span className="absolute top-1 -left-[5px] size-[9px] border border-malachite bg-malachite" />
                  {page.showDates && x.shipped && !page.shippedByMonth ? (
                    <p className="font-mono text-[11px] text-ink-3">{formatShort(x.shipped, null)}</p>
                  ) : null}
                  <button
                    onClick={() => setDetail(x.id)}
                    className="mt-0.5 flex items-center gap-2 text-left text-sm hover:underline"
                  >
                    {x.title}
                    {page.showProjects && x.project ? <ProjectMark project={x.project} /> : null}
                  </button>
                  {page.voting ? (
                    <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                      {x.votes ?? 0} {x.votes === 1 ? "person" : "people"} asked for this
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ))}
        {shippedAll.length > limit ? (
          <button
            onClick={() => setAllShipped(true)}
            className={cn("mt-4 text-xs text-ink-2 underline-offset-2 hover:underline", t.text)}
          >
            Show all {shippedAll.length}
          </button>
        ) : null}
      </section>
    ) : null;

  const blocks: Record<PageSection, React.ReactNode> = { roadmap, ideas: ideasBlock, shipped: shippedBlock };

  return (
    <div
      data-theme={page.theme === "visitor" ? undefined : page.theme}
      style={accentVars(page.color)}
      className="acta-page bg-page text-ink"
    >
      {page.css.trim() ? <style dangerouslySetInnerHTML={{ __html: pageCss(page.css) }} /> : null}
      {page.headerHtml.trim() ? <PageFrame html={page.headerHtml} label="Header" /> : null}
      {page.announcement.trim() ? (
        <div
          className={cn(
            "acta-announcement flex items-center justify-center gap-2 border-b px-4 py-2 text-center text-sm",
            t.soft,
          )}
        >
          <Icon name="sparkle" size="sm" className="shrink-0" />
          {announcementHref ? (
            <a href={announcementHref} {...outside} className="underline-offset-2 hover:underline">
              {page.announcement} <span aria-hidden>→</span>
            </a>
          ) : (
            <span>{page.announcement}</span>
          )}
        </div>
      ) : null}

      <div className={cn("acta-body px-4 @2xl:px-10", compact ? "py-6 @2xl:py-8" : "py-8 @2xl:py-10")}>
        <div className="acta-hero">{hero}</div>
        <div className={cn("acta-sections flex flex-col", compact ? "mt-6 gap-8" : "mt-8 gap-12")}>
          {page.sections.map((s) =>
            blocks[s] ? (
              <div key={s} className={`acta-section acta-${s}`}>
                {blocks[s]}
              </div>
            ) : null,
          )}
        </div>

        {page.footerHtml.trim() ? (
          <PageFrame html={page.footerHtml} label="Footer" className="mt-12 block w-full border-0 bg-transparent" />
        ) : null}
        <footer className="acta-footer mt-12 border-t border-line pt-4">
          {page.footer.trim() ? <p className="mb-3 text-sm whitespace-pre-line text-ink-2">{page.footer}</p> : null}
          <p className="font-mono text-[11px] text-ink-3">
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
        </footer>
      </div>

      <D.Root open={Boolean(open)} onOpenChange={(o) => !o && setDetail(null)}>
        {open ? (
          <DialogContent title={open.title} className="max-w-xl">
            {(() => {
              const s = stageOf(open);
              return (
                <div className="flex flex-col gap-4" style={accentVars(page.color)}>
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
                          <span key={st.id} className={cn("flex-1", st.done ? tint[accent].bg : "bg-line")} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {page.voting ? (
                    <div className="flex items-center gap-3 border-t border-line pt-4">
                      <VoteButton task={open} accent={accent} onVote={() => vote(open.id)} />
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
