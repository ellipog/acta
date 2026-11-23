"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { KeyFields, type Draft, type KeyPlace } from "@/app/account/agent-keys";
import type { Access } from "@/lib/agents/keys";
import type { AuthorizeQuery } from "@/lib/oauth/grants";
import { allowAgent } from "./actions";

type ClientView = { name: string; from: string | null; returnsTo: string };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-line py-2 first:border-t-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-[12px] text-ink">{value}</dd>
    </div>
  );
}

export function Consent({
  query,
  client,
  email,
  access,
  workspaces,
  full,
  denyUrl,
}: {
  query: AuthorizeQuery;
  client: ClientView;
  email: string;
  access: Access;
  workspaces: KeyPlace[];
  full: string | null;
  denyUrl: string;
}) {
  const [draft, setDraft] = useState<Draft>({ name: client.name.slice(0, 40).trim(), access, reach: "all", picked: [] });
  const [state, setState] = useState<"idle" | "busy" | "sent" | "denied">("idle");
  const [problem, setProblem] = useState<string | null>(full);

  async function allow() {
    setState("busy");
    setProblem(null);
    const result = await allowAgent(query, {
      name: draft.name,
      access: draft.access,
      workspaces: draft.reach === "some" ? draft.picked : null,
    }).catch(() => ({ ok: false as const, message: "That didn’t go through. Try again." }));
    if (!result.ok) {
      setState("idle");
      return setProblem(result.message);
    }
    setState("sent");
    window.location.assign(result.url);
  }

  if (state === "sent" || state === "denied")
    return (
      <div className="flex flex-col items-center text-center">
        <span className="grid size-12 place-items-center border border-line bg-raised text-ink-2">
          <Icon name={state === "sent" ? "check" : "x"} />
        </span>
        <h1 className="mt-6 font-display text-3xl">{state === "sent" ? `${client.name} is connected` : "Not connected"}</h1>
        <p className="mt-2 text-sm text-ink-2">You can close this tab.</p>
      </div>
    );

  return (
    <div className="flex flex-col">
      <h1 className="font-display text-3xl">Connect {client.name}</h1>
      <dl className="mt-5 border border-line px-3 text-sm">
        <Row label="Acts as" value={email} />
        {client.from ? <Row label="Published by" value={client.from} /> : null}
        <Row label="Sends you back to" value={client.returnsTo} />
      </dl>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void allow();
        }}
        className="mt-6 flex flex-col gap-5"
      >
        <KeyFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} workspaces={workspaces} />
        {problem ? <p className="text-xs text-hematite">{problem}</p> : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={state === "busy"}
            onClick={() => {
              setState("denied");
              window.location.assign(denyUrl);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={state === "busy" || Boolean(full)}>
            {state === "busy" ? <Spinner className="[&>span.spin-cell]:bg-on-accent/40" /> : null} Allow
          </Button>
        </div>
      </form>
    </div>
  );
}
