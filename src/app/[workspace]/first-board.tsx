"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Dither } from "@/components/ui/dither";
import { Spinner } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { createBoard } from "@/lib/actions";
import type { WorkspaceSummary } from "@/lib/live";

export function FirstBoard({ workspace }: { workspace: WorkspaceSummary }) {
  const [result, action, pending] = useActionState(createBoard, null);
  return (
    <div className="flex flex-col items-center text-center">
      <Dither name="crystal-column" tone="muted" />
      <h1 className="mt-6 font-display text-3xl">No boards yet</h1>
      <p className="mt-2 max-w-xs text-sm text-ink-2">
        Boards hold your tasks. Make one for each product, project or team in {workspace.name}.
      </p>
      <form action={action} className="mt-8 flex w-full flex-col gap-2 text-left">
        <input type="hidden" name="workspace" value={workspace.id} />
        <input type="hidden" name="workspaceSlug" value={workspace.slug} />
        <label htmlFor="name" className="text-xs font-medium text-ink-2">
          Board name
        </label>
        <div className="flex gap-2">
          <Input id="name" name="name" placeholder="Product" maxLength={60} required autoFocus />
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? <Spinner className="[&>span.spin-cell]:bg-on-accent/40" /> : <Icon name="plus" />} Create
          </Button>
        </div>
        {result && !result.ok ? <p className="text-xs text-hematite">{result.message}</p> : null}
      </form>
    </div>
  );
}
