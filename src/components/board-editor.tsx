"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import type { BoardFields } from "@/lib/board-actions";
import type { Label, Project, Tone } from "@/lib/board-store";
import { boardSlugProblem, siteHost, SLUG_MAX, slugify } from "@/lib/slugs";
import { loadClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

// A board's name, address, labels and projects, from the sidebar or the workspace settings

export type EditableBoard = { id: string; slug: string; name: string; labels?: Label[]; projects?: Project[] };

const toneClass: Record<Tone | "ink", string> = {
  lapis: "bg-lapis",
  pyrite: "bg-pyrite",
  malachite: "bg-malachite",
  hematite: "bg-hematite",
  ink: "bg-ink",
};
const labelTones: Tone[] = ["lapis", "pyrite", "malachite", "hematite"];
const projectTones: (Tone | "ink")[] = ["lapis", "pyrite", "malachite", "hematite", "ink"];

function ToneButton<T extends string>({ tone, tones, onChange }: { tone: T; tones: T[]; onChange: (t: T) => void }) {
  return (
    <button
      type="button"
      aria-label={`Colour: ${tone}. Change it`}
      onClick={() => onChange(tones[(tones.indexOf(tone) + 1) % tones.length])}
      className="grid size-9 shrink-0 place-items-center border border-line-strong bg-raised hover:border-ink-3"
    >
      <span className={cn("size-3.5", toneClass[tone as Tone | "ink"])} />
    </button>
  );
}

export function BoardEditor({
  board,
  workspace,
  open,
  onOpenChange,
  onSave,
}: {
  board: EditableBoard;
  workspace: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (change: BoardFields) => void;
}) {
  const [name, setName] = useState(board.name);
  const [slug, setSlug] = useState(board.slug);
  const [labels, setLabels] = useState<Label[] | null>(board.labels ?? null);
  const [projects, setProjects] = useState<Project[] | null>(board.projects ?? null);
  const [seen, setSeen] = useState(false);
  const cleanSlug = slug.replace(/-+$/, "");
  const problem = cleanSlug === board.slug ? null : boardSlugProblem(cleanSlug);

  // Each opening starts from the board as it is now. A board that isn't loaded yet reads its labels first
  if (open && !seen) {
    setSeen(true);
    setName(board.name);
    setSlug(board.slug);
    setLabels(board.labels ?? null);
    setProjects(board.projects ?? null);
  }
  if (!open && seen) setSeen(false);

  const unread = open && (!board.labels || !board.projects);
  useEffect(() => {
    if (!unread) return;
    let stale = false;
    void loadClient().then(async (supabase) => {
      const { data } = await supabase.from("boards").select("labels, projects").eq("id", board.id).single();
      if (stale) return;
      setLabels((l) => l ?? (data?.labels as Label[] | undefined) ?? []);
      setProjects((p) => p ?? (data?.projects as Project[] | undefined) ?? []);
    });
    return () => {
      stale = true;
    };
  }, [unread, board.id]);

  const save = () => {
    const change: BoardFields = {};
    if (name.trim() !== board.name) change.name = name;
    if (cleanSlug !== board.slug) change.slug = cleanSlug;
    if (labels && JSON.stringify(labels) !== JSON.stringify(board.labels)) change.labels = labels;
    if (projects && JSON.stringify(projects) !== JSON.stringify(board.projects)) change.projects = projects;
    onOpenChange(false);
    if (Object.keys(change).length) onSave(change);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Edit ${board.name}`}
        description="Renaming a label doesn’t change tasks that already have it."
        className="max-w-xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && !problem) save();
          }}
        >
          <div className="flex max-h-[60vh] flex-col gap-6 overflow-y-auto pr-1">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`name-${board.id}`} className="text-xs font-medium text-ink-2">
                Name
              </label>
              <Input id={`name-${board.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`slug-${board.id}`} className="text-xs font-medium text-ink-2">
                Address
              </label>
              <div
                className={cn(
                  "flex h-9 items-center border bg-raised text-sm focus-within:ring-2",
                  problem
                    ? "border-hematite focus-within:ring-hematite/25"
                    : "border-line-strong focus-within:border-lapis focus-within:ring-lapis/25",
                )}
              >
                <span className="max-w-[55%] shrink-0 truncate border-r border-line bg-sunken px-2 font-mono text-[11px] leading-[2.15rem] text-ink-3">
                  {siteHost}/{workspace}/
                </span>
                <input
                  id={`slug-${board.id}`}
                  value={slug}
                  maxLength={SLUG_MAX}
                  spellCheck={false}
                  aria-invalid={Boolean(problem)}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  onBlur={() => setSlug(cleanSlug)}
                  className="h-full min-w-0 flex-1 bg-transparent px-2 font-mono text-[13px] outline-none"
                />
              </div>
              <p className={cn("text-[11px]", problem ? "text-hematite" : "text-ink-3")}>
                {problem ?? "Changing it changes the links to this board and its public roadmap."}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-ink-2">Labels</p>
              {labels ? (
                <>
                  {labels.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <ToneButton
                        tone={l.tone}
                        tones={labelTones}
                        onChange={(tone) => setLabels(labels.map((x, j) => (j === i ? { ...x, tone } : x)))}
                      />
                      <Input
                        value={l.id}
                        autoFocus={!l.id && i === labels.length - 1}
                        aria-label="Label name"
                        maxLength={40}
                        onChange={(e) => setLabels(labels.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove label"
                        onClick={() => setLabels(labels.filter((_, j) => j !== i))}
                      >
                        <Icon name="x" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => setLabels([...labels, { id: "", tone: labelTones[labels.length % labelTones.length] }])}
                  >
                    <Icon name="plus" /> Add label
                  </Button>
                </>
              ) : (
                <p className="text-xs text-ink-3">Reading the labels…</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-ink-2">Projects</p>
              {projects ? (
                <>
                  {projects.map((p, i) => (
                    <div key={i} className="flex gap-2">
                      <ToneButton
                        tone={p.tone}
                        tones={projectTones}
                        onChange={(tone) => setProjects(projects.map((x, j) => (j === i ? { ...x, tone } : x)))}
                      />
                      <Input
                        value={p.name}
                        autoFocus={!p.name && i === projects.length - 1}
                        aria-label="Project name"
                        maxLength={40}
                        onChange={(e) =>
                          setProjects(projects.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove project"
                        onClick={() => setProjects(projects.filter((_, j) => j !== i))}
                      >
                        <Icon name="x" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      setProjects([...projects, { name: "", tone: projectTones[projects.length % projectTones.length] }])
                    }
                  >
                    <Icon name="plus" /> Add project
                  </Button>
                </>
              ) : (
                <p className="text-xs text-ink-3">Reading the projects…</p>
              )}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" disabled={!name.trim() || Boolean(problem)}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteBoardDialog({
  board,
  open,
  onOpenChange,
  onDelete,
}: {
  board: { name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const ready = confirm.trim() === board.name;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setConfirm("");
        onOpenChange(o);
      }}
    >
      <DialogContent
        title={`Delete ${board.name}?`}
        description="Every task, comment and vote on it goes too. This can’t be undone."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) return;
            onOpenChange(false);
            setConfirm("");
            onDelete();
          }}
        >
          <label htmlFor="confirm-board" className="text-sm text-ink-2">
            Type <span className="font-mono text-ink">{board.name}</span> to confirm.
          </label>
          <Input id="confirm-board" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          <Button type="submit" variant="danger" disabled={!ready} className="self-end">
            <Icon name="trash" /> Delete board
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
