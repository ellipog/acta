import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Badge, Kbd } from "@/components/ui/badge";
import { Dither, DitherFill, DitherShadow } from "@/components/ui/dither";
import { Avatar, AvatarStack, EmptyState, Panel, Progress } from "@/components/ui/display";
import { Icon, iconNames } from "@/components/ui/icons";
import { Surface } from "@/components/ui/overlays";
import {
  DropSlot,
  PriorityIcon,
  ProjectMark,
  SizeIcon,
  StatusMarker,
  SubtaskCells,
  TaskCard,
  type Priority,
  type StatusCategory,
} from "@/components/board";
import { LabelDot } from "@/components/board-app/fields";
import { BoardApp } from "@/components/board-app/board-app";
import { Contact, Strata } from "@/components/strata";
import { DitherPlayground } from "@/components/dither-playground";
import { Fig, SectionMark } from "@/components/landing/parts";
import {
  ContextMenuDemo,
  DueStates,
  FeedbackDemo,
  FormDemo,
  IconGallery,
  InboxDemo,
  OverlayDemos,
  PickerDemo,
  WritingDemo,
} from "@/components/library-demos";
import { ditherAssets, type DitherName } from "@/lib/dither-assets";
import { labels, projects, seedBoard, sizes } from "@/lib/board-store";

export const metadata: Metadata = {
  title: "Library · Acta",
  description: "Acta’s tokens, icons, textures and components, all in one place.",
};

const chapters = [
  {
    n: "I",
    title: "Foundations",
    sections: [
      ["colors", "Colors"],
      ["type", "Type"],
      ["icons", "Icons"],
      ["surfaces", "Surfaces"],
    ],
  },
  {
    n: "II",
    title: "Texture",
    sections: [
      ["dither", "Dither"],
      ["strata", "Strata"],
      ["images", "Images"],
      ["playground", "Playground"],
    ],
  },
  {
    n: "III",
    title: "Controls",
    sections: [
      ["buttons", "Buttons"],
      ["forms", "Forms"],
      ["pickers", "Pickers"],
      ["writing", "Writing"],
    ],
  },
  {
    n: "IV",
    title: "Overlays",
    sections: [
      ["overlays", "Dialogs and menus"],
      ["context", "Right-click"],
    ],
  },
  {
    n: "V",
    title: "Board",
    sections: [
      ["badges", "Badges and avatars"],
      ["fields", "Field markers"],
      ["tasks", "Tasks and board"],
      ["table", "Table"],
      ["roadmap", "Roadmap"],
      ["public", "Public roadmap"],
      ["inbox", "Inbox"],
    ],
  },
  {
    n: "VI",
    title: "Feedback",
    sections: [
      ["feedback", "Toasts and loading"],
      ["empty", "Empty states"],
      ["shortcuts", "Shortcuts"],
    ],
  },
] as const;

const swatches = [
  { name: "Stone", tokens: ["page", "surface", "raised", "sunken"] },
  { name: "Ink", tokens: ["ink", "ink-2", "ink-3", "line", "line-strong"] },
  { name: "Lapis", tokens: ["lapis", "lapis-hover", "lapis-soft", "lapis-ink"] },
  { name: "Pyrite", tokens: ["pyrite", "pyrite-soft", "pyrite-ink"] },
  { name: "Malachite", tokens: ["malachite", "malachite-soft", "malachite-ink"] },
  { name: "Hematite", tokens: ["hematite", "hematite-soft", "hematite-ink"] },
  { name: "Depth", tokens: ["depth-1", "depth-2", "depth-3", "depth-4"] },
  { name: "Bedrock", tokens: ["bedrock", "bedrock-2", "bedrock-ink", "bedrock-muted"] },
];

const shortcuts: [string[], string][] = [
  [["⌘", "K"], "Command palette"],
  [["C"], "New task"],
  [["/"], "Search the board"],
  [["↵"], "Open the focused task"],
  [["Space"], "Pick up a card, then arrows to move it"],
  [["Esc"], "Close, or drop a card back"],
  [["PgUp"], "Previous month in a calendar"],
  [["Shift", "PgUp"], "Previous year"],
  [["↑", "↓"], "Step a number field"],
];

export default function LibraryPage() {
  const images = Object.keys(ditherAssets) as DitherName[];
  const { tasks } = seedBoard();
  const stats = [
    [String(iconNames.length), "icons"],
    ["6", "minerals"],
    ["4", "densities"],
    [String(images.length), "plates"],
  ];

  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-10 px-4 py-12 sm:px-6">
        <nav aria-label="Library sections" className="sticky top-20 hidden h-fit max-h-[calc(100dvh-6rem)] w-48 shrink-0 flex-col gap-5 overflow-y-auto text-sm lg:flex">
          {chapters.map((c) => (
            <div key={c.n}>
              <p className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-ink-3 uppercase">
                {c.n} · {c.title}
              </p>
              {c.sections.map(([id, label]) => (
                <a key={id} href={`#${id}`} className="block border-l border-line py-1 pl-3 text-ink-2 hover:border-lapis hover:text-ink">
                  {label}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <main className="min-w-0 flex-1">
          <header className="grid gap-8 border-b border-line pb-10 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="font-mono text-[11px] tracking-[0.16em] text-ink-3 uppercase">Acta · Design library</p>
              <h1 className="mt-4 font-display text-5xl sm:text-6xl">Library</h1>
              <p className="mt-4 max-w-xl text-ink-2">
                Every token, icon, texture and component Acta is built from. Square corners, hairlines, lapis and
                pyrite on stone, and one ordered dither for every texture. Nothing here is a browser default.
              </p>
            </div>
            <dl className="grid grid-cols-4 border border-line bg-raised md:w-80">
              {stats.map(([value, label]) => (
                <div key={label} className="border-r border-line px-3 py-3 last:border-r-0">
                  <dt className="sr-only">{label}</dt>
                  <dd className="font-display text-2xl">{value}</dd>
                  <dd className="font-mono text-[10px] text-ink-3">{label}</dd>
                </div>
              ))}
            </dl>
          </header>

          <Chapter n="I" title="Foundations" tone="pyrite" />

          <Section id="colors" title="Colors" note="Tokens are CSS variables, swapped wholesale for basalt (dark).">
            <div className="grid gap-6 sm:grid-cols-2">
              {swatches.map((g) => (
                <div key={g.name}>
                  <p className="mb-2 text-sm font-medium">{g.name}</p>
                  <div className="flex border border-line">
                    {g.tokens.map((t) => (
                      <div key={t} className="min-w-0 flex-1">
                        <div className="h-14 border-r border-line" style={{ background: `var(--${t})` }} />
                        <p className="truncate px-1.5 py-1 font-mono text-[10px] text-ink-3">{t}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="type" title="Type" note="Marcellus for display, Geist for reading, Geist Mono for IDs and counts, EB Garamond italic for captions.">
            <div className="flex flex-col gap-6">
              <div className="grid gap-2 sm:grid-cols-[7rem_1fr] sm:items-baseline">
                <span className="font-mono text-[11px] text-ink-3">Display</span>
                <p className="font-display text-5xl leading-none">Work, laid down in layers.</p>
                <span className="font-mono text-[11px] text-ink-3">Heading</span>
                <p className="font-display text-2xl">Columns that hold</p>
                <span className="font-mono text-[11px] text-ink-3">Body</span>
                <p className="max-w-lg text-base text-ink-2">
                  Geist carries everything you read all day: task titles, descriptions, comments and settings.
                </p>
                <span className="font-mono text-[11px] text-ink-3">Mono</span>
                <p className="font-mono text-sm text-ink-2">ACT-42 · Nov 12 · 3/5 · 212 votes</p>
                <span className="font-mono text-[11px] text-ink-3">Caption</span>
                <Fig as="p" n="1" title="Columnar basalt">
                  Lava cools, splits into columns, and stands for ages.
                </Fig>
                <span className="font-mono text-[11px] text-ink-3">Section mark</span>
                <SectionMark n="II" rock="Crystal" base="page" tone="lapis" level={25} />
              </div>
            </div>
          </Section>

          <Section id="icons" title="Icons" note={`${iconNames.length} icons drawn by hand on a 9×9 grid, so they share the grain of the dithers.`}>
            <IconGallery />
          </Section>

          <Section id="surfaces" title="Surfaces" note="Three ways to lift something off the page. Never a blur, never a rounded corner.">
            <div className="grid gap-8 sm:grid-cols-3">
              <div>
                <Panel className="p-4 text-sm">A panel: surface and a hairline.</Panel>
                <p className="mt-3 font-mono text-[11px] text-ink-3">Panel</p>
              </div>
              <div>
                <Panel shadow className="p-4 text-sm">
                  Raised with a light dither.
                </Panel>
                <p className="mt-3 font-mono text-[11px] text-ink-3">Panel shadow</p>
              </div>
              <div>
                <Surface className="p-4 text-sm">Floating: menus, popovers, toasts.</Surface>
                <p className="mt-3 font-mono text-[11px] text-ink-3">Surface</p>
              </div>
            </div>
          </Section>

          <Chapter n="II" title="Texture" tone="lapis" />

          <Section id="dither" title="Dither" note="Four densities cut from one 4×4 Bayer matrix. Any token can be the ink.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([12, 25, 50, 75] as const).map((l) => (
                <div key={l}>
                  <DitherFill level={l} tone="ink" className="h-20 border border-line" />
                  <p className="mt-1 font-mono text-[11px] text-ink-3">dither-{l}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-start gap-10">
              <DitherShadow offset={6}>
                <Panel className="w-56 bg-raised p-4 text-sm">Dithered shadow, never a blur.</Panel>
              </DitherShadow>
              <div className="flex gap-2">
                {(["lapis", "pyrite", "malachite", "hematite"] as const).map((t) => (
                  <DitherFill key={t} level={50} tone={t} className="size-14 border border-line" />
                ))}
              </div>
              <div className="strata h-14 w-40 border border-line" />
            </div>
          </Section>

          <Section id="strata" title="Strata" note="Generated on a canvas: noisy contacts, Bayer density per layer, redrawn on theme change.">
            <Strata
              seed={3}
              className="border border-line"
              layers={[
                { tone: "page", density: 1, thickness: 12 },
                { tone: "pyrite", density: 0.3, thickness: 22, base: "page", texture: 0.3 },
                { tone: "lapis", density: 0.6, thickness: 30, base: "page", texture: 0.25 },
                { tone: "ink", density: 0.14, thickness: 26, base: "page", texture: 0.2 },
                { tone: "malachite", density: 0.5, thickness: 18, base: "page", texture: 0.3 },
                { tone: "ink", density: 0.85, thickness: 32, texture: 0.1 },
              ]}
            />
            <p className="mt-6 mb-2 font-mono text-[11px] text-ink-3">Contact, between two sections</p>
            <div className="border border-line">
              <div className="h-8 bg-page" />
              <Contact from="page" to="depth-3" seed={4} />
              <div className="h-8 bg-depth-3" />
              <Contact from="depth-3" to="bedrock" seed={6} />
              <div className="h-8 bg-bedrock" />
            </div>
            <p className="mt-6 mb-2 font-mono text-[11px] text-ink-3">Two-ink plates: the darkest tones print in a second color</p>
            <div className="flex flex-wrap items-end gap-6">
              <Dither name="basalt-rise" tone="lapis" deep="ink" label="Basalt, lapis and ink" />
              <Dither name="karli-hall" tone="pyrite" deep="ink" label="Karli, pyrite and ink" />
              <Dither name="basalt-rise" tone="malachite" deep="hematite" label="Basalt, malachite and hematite" />
            </div>
          </Section>

          <Section id="images" title="Images" note="1-bit masks from npm run dither, painted with CSS. Click through for sources.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((name) => {
                const a = ditherAssets[name];
                return (
                  <a key={name} href={a.href} className="group block">
                    <div className="relative aspect-square overflow-hidden border border-line bg-surface">
                      <Dither
                        name={name}
                        tone={a.kind === "photo" ? "ink" : "lapis"}
                        fill
                        smooth={a.kind === "crystal"}
                        className={a.kind === "crystal" ? "inset-3" : ""}
                      />
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-ink-2 group-hover:text-ink">{name}</p>
                    <p className="truncate text-[11px] text-ink-3">{a.license}</p>
                  </a>
                );
              })}
            </div>
          </Section>

          <Section id="playground" title="Playground" note="Tune a dither live, then paste the recipe into the config.">
            <DitherPlayground />
          </Section>

          <Chapter n="III" title="Controls" tone="ink" />

          <Section id="buttons" title="Buttons">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">
                Primary <Icon name="arrow-right" />
              </Button>
              <Button>Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="pyrite">
                <Icon name="star" /> Pyrite
              </Button>
              <Button variant="danger">
                <Icon name="trash" /> Delete board
              </Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button>Medium</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Add">
                <Icon name="plus" />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Settings">
                <Icon name="settings" />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="More">
                <Icon name="dots" size="sm" />
              </Button>
            </div>
          </Section>

          <Section id="forms" title="Forms" note="Text fields stay native for typing; everything around them is drawn by us.">
            <FormDemo />
          </Section>

          <Section id="pickers" title="Pickers" note="Selects, dates and colors open on dithered surfaces, with full keyboard support.">
            <PickerDemo />
          </Section>

          <Section id="writing" title="Writing" note="Descriptions and comments are Markdown, with a toolbar for people who’d rather not type asterisks.">
            <WritingDemo />
          </Section>

          <Chapter n="IV" title="Overlays" tone="lapis" />

          <Section id="overlays" title="Dialogs and menus" note="Every floating thing sits on the same surface and casts the same dithered shadow.">
            <OverlayDemos />
          </Section>

          <Section id="context" title="Right-click" note="The browser’s own context menu never shows on a task.">
            <ContextMenuDemo />
          </Section>

          <Chapter n="V" title="Board" tone="malachite" />

          <Section id="badges" title="Badges and avatars">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Stone</Badge>
              <Badge tone="lapis">Feature</Badge>
              <Badge tone="pyrite">Infra</Badge>
              <Badge tone="malachite">Design</Badge>
              <Badge tone="hematite">Bug</Badge>
              <Badge tone="outline">Outline</Badge>
              <span className="ml-3 flex items-center gap-1 text-sm text-ink-3">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <Avatar name="Elliot Saaen" size="xs" />
                <Avatar name="Elliot Saaen" size="sm" />
                <Avatar name="Mara Lind" tone="pyrite" />
                <Avatar name="Jon Okafor" tone="malachite" size="lg" />
              </div>
              <AvatarStack>
                <Avatar name="Elliot Saaen" />
                <Avatar name="Mara Lind" tone="pyrite" />
                <Avatar name="Jon Okafor" tone="malachite" />
                <Avatar name="Ines Varga" tone="hematite" />
              </AvatarStack>
              <div className="flex items-center gap-2">
                <p className="mr-1 text-xs text-ink-3">Workspace sigils</p>
                <Avatar name="Ellipog Team" sigil="crystal-cluster" size="lg" />
                <Avatar name="Personal" sigil="crystal-prism" tone="pyrite" size="lg" />
                <Avatar name="Side project" sigil="crystal-tablet" tone="malachite" size="lg" />
              </div>
            </div>
          </Section>

          <Section id="fields" title="Field markers" note="Each field has a mark that reads at a glance and survives in one color.">
            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <p className="mb-3 font-mono text-[11px] text-ink-3">Status: denser as it settles</p>
                <ul className="flex flex-col gap-2 text-sm">
                  {(["backlog", "todo", "in_progress", "review", "done"] as StatusCategory[]).map((s) => (
                    <li key={s} className="flex items-center gap-2">
                      <StatusMarker status={s} /> {s.replace("_", " ")}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-3 font-mono text-[11px] text-ink-3">Priority: stacked like beds</p>
                <ul className="flex flex-col gap-2 text-sm">
                  {(["urgent", "high", "medium", "low", "none"] as Priority[]).map((p) => (
                    <li key={p} className="flex items-center gap-2">
                      <PriorityIcon priority={p} /> {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-3 font-mono text-[11px] text-ink-3">Size: a growing square</p>
                <ul className="flex flex-col gap-2 text-sm">
                  {sizes.map((z) => (
                    <li key={z.id} className="flex items-center gap-2">
                      <SizeIcon size={z.id} /> {z.title}
                    </li>
                  ))}
                  <li className="flex items-center gap-2 text-ink-3">
                    <SizeIcon /> none
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              <div>
                <p className="mb-3 font-mono text-[11px] text-ink-3">Project: its mineral</p>
                <ul className="flex flex-col gap-2 text-sm">
                  {projects.map((p) => (
                    <li key={p} className="flex items-center gap-2">
                      <ProjectMark project={p} /> {p}
                    </li>
                  ))}
                  <li className="flex items-center gap-2 text-ink-3">
                    <ProjectMark /> none
                  </li>
                </ul>
              </div>
              <div>
                <p className="mb-3 font-mono text-[11px] text-ink-3">Labels: a solid pixel</p>
                <ul className="flex flex-col gap-2 text-sm">
                  {labels.map((l) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <LabelDot id={l.id} /> {l.id}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-3 font-mono text-[11px] text-ink-3">Due: louder as it nears</p>
                <DueStates />
              </div>
            </div>
            <div className="mt-8 grid max-w-md gap-3">
              <p className="font-mono text-[11px] text-ink-3">Progress and subtasks</p>
              <Progress value={20} />
              <Progress value={60} tone="pyrite" />
              <Progress value={100} tone="malachite" />
              <span className="text-[11px] text-ink-3">
                <SubtaskCells subtasks={tasks["ACT-42"].subtasks} />
              </span>
            </div>
          </Section>

          <Section id="tasks" title="Tasks and board" note="Cards at rest, mid-drag and the slot they land in. Below, the whole board in a box.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {["ACT-51", "ACT-42", "ACT-29"].map((id) => (
                <TaskCard key={id} task={tasks[id]} />
              ))}
            </div>
            <div className="mt-8 grid max-w-2xl gap-8 sm:grid-cols-2">
              <div>
                <TaskCard task={tasks["ACT-47"]} dragging />
                <p className="mt-4 font-mono text-[11px] text-ink-3">dragging</p>
              </div>
              <div>
                <DropSlot className="h-[118px]" />
                <p className="mt-4 font-mono text-[11px] text-ink-3">drop slot</p>
              </div>
            </div>
            <DitherShadow offset={6} className="mt-10">
              <BoardApp variant="embed" />
            </DitherShadow>
          </Section>

          <Section id="table" title="Table" note="The view people live in. Arrow keys move, Enter edits, X selects, ⌘C and ⌘V carry values between cells.">
            <DitherShadow offset={6}>
              <BoardApp variant="embed" view="table" />
            </DitherShadow>
          </Section>

          <Section id="roadmap" title="Roadmap" note="A timeline of start and target dates. Drag a bar to move it, its ends to resize, or hover an empty row to schedule.">
            <DitherShadow offset={6}>
              <BoardApp variant="embed" view="roadmap" />
            </DitherShadow>
          </Section>

          <Section id="public" title="Public roadmap" note="What visitors see, and how you shape it: the main view, the names, the plate and what’s on show.">
            <DitherShadow offset={6}>
              <BoardApp variant="embed" view="public" />
            </DitherShadow>
          </Section>

          <Section id="inbox" title="Inbox" note="Mentions, assignments and moves. Unread carries a lapis pixel.">
            <InboxDemo />
          </Section>

          <Chapter n="VI" title="Feedback" tone="hematite" />

          <Section id="feedback" title="Toasts and loading" note="Toasts wear away in whole pixels. Loading grain drifts instead of shimmering.">
            <FeedbackDemo />
          </Section>

          <Section id="empty" title="Empty states">
            <div className="grid gap-3 md:grid-cols-2">
              <Panel>
                <EmptyState
                  art="crystal-tablet"
                  title="Lay the first stone"
                  body="This board has no tasks yet. Add one, or press C anywhere."
                  action={
                    <Button variant="primary" size="sm">
                      <Icon name="plus" size="sm" /> New task
                    </Button>
                  }
                />
              </Panel>
              <Panel>
                <EmptyState
                  art="crystal-shard"
                  title="Nothing matches"
                  body="No tasks fit these filters. Loosen one to see more."
                  action={
                    <Button size="sm">
                      <Icon name="filter" size="sm" /> Clear filters
                    </Button>
                  }
                />
              </Panel>
            </div>
          </Section>

          <Section id="shortcuts" title="Shortcuts" note="The board and its pickers can be run without a mouse.">
            <dl className="grid max-w-2xl border-t border-line sm:grid-cols-2 sm:gap-x-8">
              {shortcuts.map(([keys, what]) => (
                <div key={what} className="flex items-center gap-3 border-b border-line py-2.5">
                  <dt className="flex w-24 shrink-0 gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </dt>
                  <dd className="text-sm text-ink-2">{what}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}

function Chapter({ n, title, tone }: { n: string; title: string; tone: "pyrite" | "lapis" | "ink" | "malachite" | "hematite" }) {
  return (
    <div className="mt-20 flex items-center gap-4">
      <span className="relative size-4 border border-line-strong">
        <DitherFill level={50} tone={tone} className="absolute inset-0" />
      </span>
      <p className="font-display text-xl">
        <span className="text-ink-3">{n}.</span> {title}
      </p>
      <span className="strata h-3 flex-1 opacity-70" />
    </div>
  );
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-12 scroll-mt-20 border-t border-line pt-8">
      <h2 className="font-display text-2xl">{title}</h2>
      {note ? <p className="mt-1 max-w-2xl text-sm text-ink-3">{note}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
