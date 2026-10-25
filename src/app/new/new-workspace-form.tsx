"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eyebrow, Spinner } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { createWorkspace, slugTaken } from "@/lib/actions";
import { publicHost, SLUG_MAX, slugify, slugProblem } from "@/lib/slugs";
import { cn } from "@/lib/utils";

type Check = { slug: string; taken: boolean };

export function NewWorkspaceForm({ first, name }: { first: boolean; name: string }) {
  const [result, action, pending] = useActionState(createWorkspace, null);
  const [title, setTitle] = useState("");
  const [custom, setCustom] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);

  const slug = (custom ?? slugify(title)).replace(/-+$/, "");
  const problem = slug ? slugProblem(slug) : null;

  useEffect(() => {
    if (!slug || problem) return;
    let live = true;
    const t = setTimeout(async () => {
      const taken = await slugTaken(slug).catch(() => false);
      if (live) setCheck({ slug, taken });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [slug, problem]);

  const known = check?.slug === slug ? check : null;
  const state = !slug ? "empty" : problem ? "problem" : !known ? "checking" : known.taken ? "taken" : "free";
  const hint = {
    empty: "Letters, numbers and hyphens. Your public roadmaps live here.",
    problem: problem,
    checking: "Checking…",
    taken: "Someone already has that address.",
    free: "It’s yours.",
  }[state];

  return (
    <form action={action} className="flex flex-col gap-5">
      <div>
        <Eyebrow>{first ? `Welcome, ${name.split(" ")[0]}` : "New workspace"}</Eyebrow>
        <h1 className="mt-3 font-display text-4xl">Set up your workspace</h1>
        <p className="mt-2 text-sm text-ink-2">You can change all of this later.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-xs font-medium text-ink-2">
          Workspace name
        </label>
        <Input
          id="name"
          name="name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Your team or company"
          maxLength={60}
          required
          autoFocus
          autoComplete="organization"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="slug" className="text-xs font-medium text-ink-2">
          Address
        </label>
        <div
          className={cn(
            "flex h-9 items-center border bg-raised text-sm focus-within:ring-2",
            state === "problem" || state === "taken"
              ? "border-hematite focus-within:ring-hematite/25"
              : "border-line-strong focus-within:border-lapis focus-within:ring-lapis/25",
          )}
        >
          <span className="shrink-0 border-r border-line bg-sunken px-2 font-mono text-[11px] leading-[2.15rem] text-ink-3">
            {publicHost}/
          </span>
          <input
            id="slug"
            name="slug"
            value={custom ?? slugify(title)}
            maxLength={SLUG_MAX}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={state === "problem" || state === "taken"}
            aria-describedby="slug-hint"
            onChange={(e) => setCustom(slugify(e.target.value))}
            onBlur={() => setCustom((c) => (c === null ? c : c.replace(/-+$/, "")))}
            className="h-full min-w-0 flex-1 bg-transparent px-2 font-mono text-[13px] outline-none"
          />
          <span className="grid w-8 shrink-0 place-items-center">
            {state === "checking" ? (
              <Spinner label="Checking" />
            ) : state === "free" ? (
              <Icon name="check" className="text-malachite" />
            ) : state === "taken" || state === "problem" ? (
              <Icon name="x" className="text-hematite" />
            ) : null}
          </span>
        </div>
        <p
          id="slug-hint"
          className={cn(
            "text-[11px]",
            state === "problem" || state === "taken"
              ? "text-hematite"
              : state === "free"
                ? "text-malachite"
                : "text-ink-3",
          )}
        >
          {hint}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="board" className="text-xs font-medium text-ink-2">
          First board
        </label>
        <Input id="board" name="board" defaultValue="Product" maxLength={60} required />
        <p className="text-[11px] text-ink-3">One board per product or project works well. You can add more.</p>
      </div>

      {result && !result.ok ? (
        <p role="alert" className="text-sm text-hematite">
          {result.message}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={pending || state === "problem" || state === "taken" || !title.trim()}
      >
        {pending ? <Spinner className="[&>span.spin-cell]:bg-on-accent/40" /> : null}
        Create workspace <Icon name="arrow-right" />
      </Button>
    </form>
  );
}
