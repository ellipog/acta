"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { CohortGrid, count, Delta, LineChart, Sparkline, Split, type Tone } from "./charts";
import { ownerRanges, type OwnerRangeId, type OwnerReport, type Part } from "./report";

// The owner's view of Acta: who uses it, what they get done, and what they reach for

const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");
const days = (n: number) => (n < 1 ? "Same day" : n === 1 ? "1 day" : `${Math.round(n * 10) / 10} days`);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const methodName: Record<string, string> = { email: "Email link", google: "Google", github: "GitHub" };

function Card({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col border border-line bg-raised", className)}>
      <header className="flex items-baseline gap-3 border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-medium">{title}</h2>
        {hint ? <p className="ml-auto truncate text-xs text-ink-3">{hint}</p> : null}
      </header>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}

function Tile({
  label,
  value,
  now,
  before,
  spark,
  tone,
}: {
  label: string;
  value: string;
  now?: number;
  before?: number;
  spark?: number[];
  tone?: Tone;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-r border-b border-line bg-raised px-4 pt-4 pb-3">
      <span className="text-xs text-ink-2">{label}</span>
      <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
      <span className="h-4">{now !== undefined && before !== undefined ? <Delta now={now} before={before} /> : null}</span>
      {spark ? (
        <span className="mt-1">
          <Sparkline values={spark} tone={tone} />
        </span>
      ) : null}
    </div>
  );
}

function Stats({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="truncate text-xs text-ink-3">{label}</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Ranked({ rows, empty }: { rows: Part[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-2 text-xs text-ink-3">{empty}</p>;
  return (
    <ol className="-mx-2">
      {rows.map((r) => (
        <li key={r.label} className="relative flex h-8 items-center gap-3 px-2 text-sm">
          <span aria-hidden className="absolute inset-y-0.5 left-0 bg-lapis-soft" style={{ width: `${(r.value / max) * 100}%` }} />
          <span className="relative min-w-0 flex-1 truncate">{r.label}</span>
          <span className="relative font-mono text-xs text-ink-2 tabular-nums">{count(r.value)}</span>
        </li>
      ))}
    </ol>
  );
}

export function OverviewView({ report: r, range, me }: { report: OwnerReport; range: OwnerRangeId; me: boolean }) {
  const bucket = r.bucket ?? ownerRanges[range].bucket;
  const slots = r.series.map((s) => s.t);
  const of = (key: keyof OwnerReport["series"][number]) => r.series.map((s) => Number(s[key]));
  const href = (next: { range?: OwnerRangeId; me?: boolean }) => {
    const q = new URLSearchParams();
    const to = next.range ?? range;
    if (to !== "30d") q.set("range", to);
    if (next.me ?? me) q.set("me", "1");
    const s = q.toString();
    return s ? `/admin?${s}` : "/admin";
  };
  const agentShare = percent(r.agents.edits, r.agents.allEdits);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Time range" className="flex flex-wrap items-center gap-3">
        <div className="flex border border-line-strong bg-raised">
          {(Object.keys(ownerRanges) as OwnerRangeId[]).map((id) => (
            <Link
              key={id}
              href={href({ range: id })}
              scroll={false}
              aria-current={id === range ? "page" : undefined}
              className={cn(
                "h-8 border-r border-line-strong px-3 font-mono text-xs leading-8 last:border-r-0",
                id === range ? "bg-ink text-page" : "text-ink-2 hover:bg-sunken hover:text-ink",
              )}
            >
              {id}
            </Link>
          ))}
        </div>
        <span className="text-xs text-ink-3">
          {range === "all" ? "Since the first account" : `Last ${ownerRanges[range].label}, compared with the ${ownerRanges[range].label} before`}
        </span>
        <Link
          href={href({ me: !me })}
          scroll={false}
          className={cn(
            "ml-auto flex h-8 items-center gap-2 border px-2.5 text-xs",
            me ? "border-pyrite bg-pyrite-soft text-pyrite-ink" : "border-line text-ink-3 hover:text-ink",
          )}
        >
          <Icon name={me ? "eye" : "eye-off"} size="sm" />
          {me ? "Including admins" : "Admins left out"}
        </Link>
      </nav>

      <div className="grid grid-cols-2 border-t border-l border-line lg:grid-cols-4">
        <Tile label="People" value={count(r.users.total)} now={r.users.new} before={r.users.newBefore} spark={of("users")} />
        <Tile label="Active people" value={count(r.users.active)} now={r.users.active} before={r.users.activeBefore} spark={of("active")} tone="malachite" />
        <Tile label="Tasks created" value={count(r.tasks.created)} now={r.tasks.created} before={r.tasks.createdBefore} spark={of("created")} tone="pyrite" />
        <Tile label="Tasks done" value={count(r.tasks.done)} now={r.tasks.done} before={r.tasks.doneBefore} spark={of("done")} tone="malachite" />
      </div>

      <Card title="People" hint={`${count(r.users.new)} new · ${count(r.users.joined)} joined someone’s workspace`}>
        <LineChart
          slots={slots}
          bucket={bucket}
          lines={[
            { key: "active", label: "Active", tone: "lapis", values: of("active"), area: true },
            { key: "signups", label: "Signed up", tone: "pyrite", values: of("signups") },
          ]}
          caption="Active means they changed or commented on something"
        />
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
          <Stats rows={[["Active today", count(r.users.daily)], ["This week", count(r.users.weekly)]]} />
          <Stats
            rows={[
              ["This month", count(r.users.monthly)],
              ["Daily of monthly", percent(r.users.daily, r.users.monthly)],
            ]}
          />
          <div className="col-span-2">
            <p className="mb-2 text-xs text-ink-3">How people sign in</p>
            <Split parts={r.users.methods} name={(l) => methodName[l] ?? capital(l)} />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Work" hint={`${count(r.tasks.open)} open of ${count(r.tasks.total)}`}>
          <LineChart
            slots={slots}
            bucket={bucket}
            height="h-44"
            lines={[
              { key: "created", label: "Created", tone: "lapis", values: of("created"), area: true },
              { key: "done", label: "Done", tone: "malachite", values: of("done"), area: true },
            ]}
          />
          <div className="mt-5 border-t border-line pt-4">
            <Stats
              rows={[
                ["Created to done", days(r.tasks.daysToDone)],
                ["Canceled", count(r.tasks.canceled)],
                ["Comments", count(r.tasks.comments)],
                ["Tasks per board", count(r.workspaces.tasksPerBoard)],
              ]}
            />
          </div>
        </Card>
        <Card title="Who makes the changes" hint={`${agentShare} by agents`}>
          <LineChart
            slots={slots}
            bucket={bucket}
            height="h-44"
            lines={[
              { key: "people", label: "By hand", tone: "lapis", values: of("byPeople"), area: true },
              { key: "agents", label: "Agents", tone: "pyrite", values: of("byAgents"), area: true },
              { key: "github", label: "GitHub", tone: "ink", values: of("byGitHub") },
            ]}
          />
          <div className="mt-5 border-t border-line pt-4">
            <Stats
              rows={[
                ["Agent keys", count(r.agents.keys)],
                ["Used this week", count(r.agents.usedKeys)],
                ["New keys", count(r.agents.newKeys)],
                ["From GitHub", count(r.agents.github)],
              ]}
            />
          </div>
        </Card>
      </div>

      <Card title="Coming back" hint="Of each week’s new people, how many did something in the weeks after">
        <CohortGrid cohorts={r.cohorts} />
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card title="Workspaces" hint={`${count(r.workspaces.new)} new`}>
          <Stats
            rows={[
              ["Workspaces", count(r.workspaces.total)],
              ["Active this week", count(r.workspaces.active)],
              ["With a team", count(r.workspaces.shared)],
              ["People in each", String(r.workspaces.members)],
              ["Boards", count(r.workspaces.boards)],
              ["Public roadmaps", count(r.roadmaps.published)],
            ]}
          />
        </Card>
        <Card title="Busiest boards" hint="By changes and comments">
          <Ranked rows={r.workspaces.busiest} empty="Nothing changed in this range" />
        </Card>
        <Card title="Agents at work" hint="By the key’s name">
          <Ranked rows={r.agents.names} empty="No agent changes in this range" />
        </Card>
        <Card title="Public roadmaps">
          <Stats
            rows={[
              ["Visitors", count(r.roadmaps.visitors)],
              ["Votes", count(r.roadmaps.votes)],
              ["Ideas sent", count(r.roadmaps.ideas)],
              ["Published", count(r.roadmaps.published)],
            ]}
          />
        </Card>
        <Card title="How people set up Acta" hint={`${count(r.appearance.browsers)} browsers`} className="md:col-span-2">
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-xs text-ink-3">Theme</p>
              <Split parts={r.appearance.theme} name={capital} empty="Shows once people open the app" />
            </div>
            <div>
              <p className="mb-2 text-xs text-ink-3">Icons</p>
              <Split parts={r.appearance.icons} name={capital} empty="Shows once people open the app" />
            </div>
            <div>
              <p className="mb-2 text-xs text-ink-3">Accent</p>
              <Split parts={r.appearance.accent} name={capital} empty="Shows once people open the app" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
