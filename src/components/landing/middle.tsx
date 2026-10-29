import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { AppSkeleton } from "@/components/app-chrome";
import { PriorityIcon, StatusMarker } from "@/components/markers";
import { Avatar } from "@/components/ui/display";
import { Badge } from "@/components/ui/badge";
import { Dither, DitherFill, DitherShadow } from "@/components/ui/dither";
import type { DitherName } from "@/lib/dither-assets";
import { BoardEmbed } from "./board-embed";
import { Fig, Plain, SectionMark } from "./parts";

export function BoardSection() {
  return (
    <section id="board" className="bg-depth-1">
      <div className="mx-auto max-w-6xl px-4 pt-20 pb-24 sm:px-6">
        <div className="grid items-end gap-8 md:grid-cols-[1fr_auto]">
          <div className="pb-8">
            <SectionMark n="I" rock="Columnar basalt" base="depth-1" tone="ink" level={50} />
            <h2 className="mt-4 font-display text-4xl sm:text-5xl">Columns that hold.</h2>
            <Plain>A kanban board, a table and a timeline, all showing the same tasks.</Plain>
            <p className="mt-4 max-w-md text-ink-2">
              Drag a card between columns. Open one to edit it, tick off subtasks, or switch to the table. This is the
              real board, running right here.
            </p>
          </div>
          <figure className="hidden md:block">
            <Fig n="1" title="Columnar basalt" className="mb-3 max-w-[440px] text-right">
              Lava cools, splits into columns, and stands for ages.
            </Fig>
            <Dither name="basalt-rise" tone="lapis" deep="ink" scale={2} label="Columnar basalt at Devil's Postpile" />
          </figure>
        </div>
        <DitherShadow offset={8}>
          <BoardEmbed fallback={<AppSkeleton embed />} />
        </DitherShadow>
        <p className="mt-5 text-sm text-ink-3">
          Nothing here is saved.{" "}
          <Link href="/demo" className="text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
            Open the full demo
          </Link>{" "}
          to keep your board between visits.
        </p>
      </div>
    </section>
  );
}

const specimens: { no: string; art: DitherName; name: string; habit: string; facets: string; sample: React.ReactNode }[] = [
  {
    no: "01",
    art: "crystal-prism",
    name: "Status",
    habit: "Single select",
    facets: "Four faces, one at a time.",
    sample: (
      <span className="flex items-center gap-3">
        {(["todo", "in_progress", "review", "done"] as const).map((s) => (
          <StatusMarker key={s} status={s} />
        ))}
      </span>
    ),
  },
  {
    no: "02",
    art: "crystal-tower",
    name: "Priority",
    habit: "Ordered select",
    facets: "Urgent down to none, stacked like beds.",
    sample: (
      <span className="flex items-center gap-3">
        {(["urgent", "high", "medium", "low", "none"] as const).map((p) => (
          <PriorityIcon key={p} priority={p} />
        ))}
      </span>
    ),
  },
  {
    no: "03",
    art: "crystal-cluster",
    name: "Project",
    habit: "Grouping select",
    facets: "Cluster tasks into lanes and sections.",
    sample: (
      <span className="flex gap-1">
        <Badge tone="lapis">Roadmap</Badge>
        <Badge tone="pyrite">Views</Badge>
        <Badge tone="malachite">Teams</Badge>
      </span>
    ),
  },
  {
    no: "04",
    art: "crystal-block",
    name: "Size",
    habit: "Graded select",
    facets: "XS to XL, for estimates without the math.",
    sample: (
      <span className="flex items-end gap-1.5">
        {[4, 6, 8, 10, 12].map((s, i) => (
          <span key={s} className={i === 2 ? "bg-lapis" : "border border-line-strong"} style={{ width: s, height: s }} />
        ))}
      </span>
    ),
  },
  {
    no: "05",
    art: "crystal-lozenge",
    name: "Due date",
    habit: "Date",
    facets: "A single day, shown in mono.",
    sample: (
      <span className="flex gap-px font-mono text-[10px]">
        {[9, 10, 11, 12, 13, 14, 15].map((d) => (
          <span key={d} className={d === 12 ? "bg-lapis px-1 text-on-accent" : "px-1 text-ink-3"}>
            {d}
          </span>
        ))}
      </span>
    ),
  },
  {
    no: "06",
    art: "crystal-shard",
    name: "Labels",
    habit: "Multi select",
    facets: "As many as a task needs, each in its own ink.",
    sample: (
      <span className="flex gap-1">
        <Badge tone="lapis">Feature</Badge>
        <Badge tone="hematite">Bug</Badge>
        <Badge tone="pyrite">Design</Badge>
      </span>
    ),
  },
];

export function FieldsSection() {
  return (
    <section id="fields" className="bg-depth-2">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="grid gap-6 md:grid-cols-[1fr_1fr] md:items-end">
          <div>
            <SectionMark n="II" rock="Crystal" base="depth-2" tone="lapis" level={25} />
            <h2 className="mt-4 font-display text-4xl sm:text-5xl">A cabinet of fields.</h2>
            <Plain>Status, priority, size, dates, labels, projects and custom fields of your own.</Plain>
          </div>
          <p className="max-w-md text-ink-2 md:justify-self-end">
            Every board comes with the same set of fields, and each board keeps its own labels and projects. Each
            field has a habit, the way a crystal does: the shape its values take.
          </p>
        </div>

        <div className="mt-12 grid border-t border-l border-line-strong sm:grid-cols-2 lg:grid-cols-3">
          {specimens.map((s) => (
            <article key={s.no} className="group flex flex-col border-r border-b border-line-strong bg-raised">
              <div className="relative h-48 overflow-hidden border-b border-line">
                <span className="absolute top-3 left-3 font-mono text-[10px] text-ink-3">No. {s.no}</span>
                <div className="absolute inset-x-10 inset-y-7">
                  <Dither name={s.art} tone="muted" fill className="transition-[background-color] group-hover:[--dither:var(--lapis)]" />
                </div>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <Fig as="p" prefix="Specimen" n={s.no.replace(/^0/, "")} title={s.name} className="text-lg" />
                <dl className="mt-3 grid grid-cols-[4.5rem_1fr] gap-y-1 text-xs">
                  <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">Habit</dt>
                  <dd className="text-ink-2">{s.habit}</dd>
                  <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">Note</dt>
                  <dd className="text-ink-2">{s.facets}</dd>
                </dl>
                <div className="mt-5 flex min-h-6 items-center border-t border-dashed border-line pt-4">{s.sample}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HandsSection() {
  return (
    <section id="hands" className="bg-depth-3">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 md:grid-cols-[auto_1fr]">
        {/* The picture is a fixed size, so narrow screens crop it rather than scroll sideways */}
        <figure className="mx-auto max-w-full min-w-0 overflow-hidden md:mx-0">
          <Dither name="karli-hall" tone="pyrite" deep="ink" scale={2} label="The chaitya hall at Karli" />
          <Fig n="2" title="The hall at Karli" className="mt-3 max-w-[460px]">
            Cut from one cliff by many hands, over generations.
          </Fig>
        </figure>

        <div>
          <SectionMark n="III" rock="Sandstone" base="depth-3" tone="pyrite" level={25} />
          <h2 className="mt-4 font-display text-4xl sm:text-5xl">Many hands, one record.</h2>
          <Plain>
            Team workspaces with roles and permissions, live updates, and AI agents like Claude Code working
            alongside you.
          </Plain>
          <p className="mt-4 max-w-md text-ink-2">
            Keep personal work and team work in separate workspaces. Invite people with a role, and watch the board
            move as they work.
          </p>

          <div className="mt-10 grid gap-px border border-line-strong bg-line-strong">
            <div className="bg-raised p-5">
              <p className="font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">Workspaces</p>
              <ul className="mt-3 flex flex-col gap-2">
                {(
                  [
                    ["Personal", "crystal-prism", "pyrite", "Owner"],
                    ["Ellipog Team", "crystal-cluster", "lapis", "Owner"],
                    ["Friend’s studio", "crystal-tablet", "malachite", "Member"],
                  ] as const
                ).map(([name, sigil, tone, role]) => (
                  <li key={name} className="flex items-center gap-3 text-sm">
                    <Avatar name={name} sigil={sigil} tone={tone} />
                    {name}
                    <span className="ml-auto font-mono text-[11px] text-ink-3">{role}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-raised p-5">
              <p className="font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">Live</p>
              <div className="mt-3 flex items-center gap-3 text-sm">
                <span className="relative">
                  <Avatar name="Mara Lind" tone="pyrite" />
                  <span className="absolute -right-1 -bottom-1 size-2.5 border border-raised bg-malachite" />
                </span>
                <p className="text-ink-2">
                  <span className="text-ink">Mara</span> is editing <span className="font-mono text-xs">ACT-42</span>
                </p>
                <span className="relative ml-auto h-2 w-16 overflow-hidden border border-line">
                  <DitherFill level={50} tone="pyrite" className="absolute inset-0 animate-pulse" />
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 bg-raised p-5 text-sm">
              <p className="w-full font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">Invite</p>
              <span className="flex h-9 flex-1 items-center border border-line-strong bg-page px-3 text-ink-3">
                name@studio.com
              </span>
              <span className="flex h-9 items-center border border-line-strong bg-page px-3 text-ink-2">Member</span>
              <Link
                href="/demo"
                className="flex h-9 items-center gap-1.5 border border-lapis bg-lapis px-3 text-on-accent hover:bg-lapis-hover"
              >
                Send <Icon name="arrow-right" size="sm" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
