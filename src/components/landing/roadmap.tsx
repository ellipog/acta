"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { StatusMarker } from "@/components/board";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { DitherFill, DitherShadow, type DitherTone } from "@/components/ui/dither";
import { cn } from "@/lib/utils";
import { SectionMark } from "./parts";

type Stage = "in_progress" | "todo" | "done";
type Item = { id: string; title: string; note: string; stage: Stage; votes: number };

const stages: { id: Stage; title: string; tone: DitherTone }[] = [
  { id: "in_progress", title: "In progress", tone: "pyrite" },
  { id: "todo", title: "Planned", tone: "lapis" },
  { id: "done", title: "Shipped", tone: "malachite" },
];

const seed: Item[] = [
  { id: "r1", stage: "in_progress", votes: 212, title: "Public roadmap", note: "Opt-in per board, with votes" },
  { id: "r2", stage: "in_progress", votes: 176, title: "Custom fields", note: "Text, number, date and select" },
  { id: "r3", stage: "todo", votes: 128, title: "Recurring tasks", note: "Daily, weekly or on a weekday" },
  { id: "r4", stage: "todo", votes: 94, title: "Calendar view", note: "Tasks laid out by due date" },
  { id: "r5", stage: "todo", votes: 61, title: "GitHub sync", note: "Link issues and pull requests" },
  { id: "r6", stage: "done", votes: 143, title: "Command palette", note: "Jump anywhere with ⌘K" },
  { id: "r7", stage: "done", votes: 119, title: "Realtime boards", note: "Every change, live for everyone" },
];

export function RoadmapSection() {
  const [items, setItems] = useState(seed);
  const [voted, setVoted] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");

  const count = (i: Item) => i.votes + (voted[i.id] ? 1 : 0);
  const max = Math.max(...items.map(count));

  const suggest = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    const id = `s${items.length + 1}`;
    setItems((list) => [...list, { id, stage: "todo", votes: 0, title, note: "Suggested just now" }]);
    setVoted((v) => ({ ...v, [id]: true }));
    setDraft("");
  };

  return (
    <section id="roadmap" className="bg-depth-4">
      <div className="mx-auto max-w-6xl px-4 pt-10 pb-28 sm:px-6">
        <div className="strata mb-16 h-4 opacity-70" />
        <div className="grid gap-6 md:grid-cols-[1fr_1fr] md:items-end">
          <div>
            <SectionMark n="V" rock="Quartz" base="depth-4" tone="lapis" level={50} />
            <h2 className="mt-4 font-display text-4xl sm:text-5xl">Build in the open.</h2>
          </div>
          <p className="max-w-md text-ink-2 md:justify-self-end">
            Give any board a public roadmap. Visitors vote and suggest, you decide what gets built, and shipped
            work stays on the record. It’s off until you turn it on.
          </p>
        </div>

        <DitherShadow offset={8} className="mt-12">
          <div className="border border-ink bg-raised">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              {open ? <Icon name="globe" className="text-lapis" /> : <Icon name="lock" className="text-ink-3" />}
              <span className="font-mono text-xs text-ink-2">acta.app/r/portfolio-site</span>
              <label className="ml-auto flex items-center gap-2.5 text-sm text-ink-2">
                Public roadmap
                <Switch checked={open} onCheckedChange={setOpen} aria-label="Public roadmap" />
              </label>
            </div>

            <div className="relative">
              <div
                aria-hidden={!open}
                inert={!open}
                className={cn("grid transition-opacity duration-300 md:grid-cols-3", !open && "opacity-25 grayscale")}
              >
                {stages.map((s) => {
                  const list = items.filter((i) => i.stage === s.id);
                  return (
                    <div key={s.id} className="border-line not-last:border-b md:not-last:border-r md:not-last:border-b-0">
                      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                        <StatusMarker status={s.id} />
                        <h3 className="text-sm font-medium">{s.title}</h3>
                        <span className="font-mono text-[11px] text-ink-3">{list.length}</span>
                      </div>
                      <ul>
                        {list.map((item) => (
                          <li key={item.id} className="flex gap-3 border-b border-line px-4 py-3 last:border-b-0">
                            <button
                              aria-pressed={!!voted[item.id]}
                              aria-label={`Vote for ${item.title}`}
                              onClick={() => setVoted((v) => ({ ...v, [item.id]: !v[item.id] }))}
                              className={cn(
                                "flex h-11 w-11 shrink-0 flex-col items-center justify-center border transition-colors",
                                voted[item.id]
                                  ? "border-lapis bg-lapis text-on-accent"
                                  : "border-line-strong bg-page text-ink-2 hover:border-lapis hover:text-ink",
                              )}
                            >
                              <Icon name="chevron-up" size="sm" />
                              <span className="font-mono text-[11px] leading-none">{count(item)}</span>
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className={cn("truncate text-sm", s.id === "done" && "text-ink-2")}>{item.title}</p>
                              <p className="truncate text-xs text-ink-3">{item.note}</p>
                              <div className="relative mt-2 h-1.5 bg-sunken">
                                <DitherFill
                                  level={s.id === "done" ? 75 : 50}
                                  tone={s.tone}
                                  className="absolute inset-y-0 left-0 transition-[width] duration-300"
                                  style={{ width: `${Math.max(3, (count(item) / max) * 100)}%` }}
                                />
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {!open ? (
                <div className="absolute inset-0 grid place-items-center p-6">
                  <div className="flex max-w-xs items-start gap-3 border border-ink bg-raised px-4 py-3 text-sm">
                    <Icon name="lock" className="mt-0.5 shrink-0 text-ink-2" />
                    <p className="text-ink-2">
                      <span className="text-ink">Private.</span> Only people in Ellipog Team can see this roadmap.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <form onSubmit={suggest} className="flex gap-2 border-t border-line bg-surface px-4 py-3">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Suggest something for this board"
                disabled={!open}
                className="flex-1"
                aria-label="Suggestion"
              />
              <Button type="submit" disabled={!open || !draft.trim()}>
                Suggest
              </Button>
            </form>
          </div>
        </DitherShadow>
      </div>
    </section>
  );
}
