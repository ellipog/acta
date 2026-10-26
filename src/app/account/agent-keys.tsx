"use client";

import { startTransition, useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Radio, RadioGroup } from "@/components/ui/controls";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import type { Access } from "@/lib/agents/keys";
import { siteUrl } from "@/lib/slugs";
import { cn } from "@/lib/utils";
import { createAgentKey, revokeAgentKey } from "./actions";

export type AgentKey = {
  id: string;
  name: string;
  access: Access;
  workspaces: string[] | null;
  hint: string;
  created_at: string;
  used_at: string | null;
};
export type KeyPlace = { id: string; slug: string; name: string };

const mcpUrl = `${siteUrl}/api/mcp`;

const levels: { value: Access; label: string; hint: string }[] = [
  { value: "read", label: "Read only", hint: "Sees boards, tasks and comments. Changes nothing." },
  { value: "write", label: "Read and write", hint: "Also creates, edits, moves and comments on tasks." },
  {
    value: "manage",
    label: "Manage",
    hint: "Also creates boards, changes labels and projects, and runs public roadmaps.",
  },
];
const levelName: Record<Access, string> = { read: "Read only", write: "Read and write", manage: "Manage" };

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function copy(text: string, what: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
  toast({ icon: "copy", title: `${what} copied`, duration: 2000 });
}

function Snippet({ code, what }: { code: string; what: string }) {
  return (
    <div className="relative mt-3 border border-line bg-sunken">
      <pre className="overflow-x-auto p-3 pr-12 font-mono text-[11px] leading-relaxed whitespace-pre text-ink">{code}</pre>
      <Button size="icon-sm" variant="ghost" aria-label={`Copy ${what}`} className="absolute top-1.5 right-1.5" onClick={() => copy(code, what)}>
        <Icon name="copy" />
      </Button>
    </div>
  );
}

function Setup({ token, example }: { token: string; example: string }) {
  const header = `Bearer ${token}`;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-ink-2">Copy the key now. You won’t see it again.</p>
        <Snippet code={token} what="Key" />
      </div>
      <Tabs defaultValue="claude">
        <TabsList>
          <TabsTrigger value="claude">Claude Code</TabsTrigger>
          <TabsTrigger value="codex">Codex</TabsTrigger>
          <TabsTrigger value="other">Cursor and others</TabsTrigger>
        </TabsList>
        <TabsContent value="claude">
          <p className="mt-3 text-xs text-ink-3">Run once. It’s then on in every project.</p>
          <Snippet
            what="Command"
            code={`claude mcp add --transport http --scope user acta ${mcpUrl} \\\n  --header "Authorization: ${header}"`}
          />
        </TabsContent>
        <TabsContent value="codex">
          <p className="mt-3 text-xs text-ink-3">Add to ~/.codex/config.toml.</p>
          <Snippet
            what="Config"
            code={`[mcp_servers.acta]\nurl = "${mcpUrl}"\nhttp_headers = { Authorization = "${header}" }`}
          />
        </TabsContent>
        <TabsContent value="other">
          <p className="mt-3 text-xs text-ink-3">For ~/.cursor/mcp.json, or any client that takes a remote MCP server.</p>
          <Snippet
            what="Config"
            code={JSON.stringify({ mcpServers: { acta: { url: mcpUrl, headers: { Authorization: header } } } }, null, 2)}
          />
        </TabsContent>
      </Tabs>
      <div>
        <p className="text-sm text-ink-2">
          Then tell each project which board it uses, with a line in its AGENTS.md or CLAUDE.md:
        </p>
        <Snippet what="Line" code={`Acta board: ${example}`} />
      </div>
    </div>
  );
}

function NewKey({ workspaces }: { workspaces: KeyPlace[] }) {
  const [state, act, pending] = useActionState(createAgentKey, null);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(state);
  const [name, setName] = useState("");
  const [access, setAccess] = useState<Access>("write");
  const [reach, setReach] = useState<"all" | "some">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const token = state?.ok && state !== seen ? state.token : undefined;
  const example = `${workspaces[0]?.slug ?? "workspace"}/board`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) return;
        if (state !== seen && state?.ok) setName("");
        setSeen(state);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Icon name="plus" /> New key
        </Button>
      </DialogTrigger>
      <DialogContent
        title={token ? "Connect your agents" : "New agent key"}
        description={token ? undefined : "The key acts as you, within the limits you set here."}
        className="max-w-xl"
      >
        {token ? (
          <div className="flex flex-col gap-5">
            <Setup token={token} example={example} />
            <DialogClose asChild>
              <Button variant="primary" className="self-end">
                Done
              </Button>
            </DialogClose>
          </div>
        ) : (
          <form
            action={(form) => {
              form.set("name", name);
              form.set("access", access);
              form.set("reach", reach);
              for (const id of picked) form.append("workspace", id);
              startTransition(() => act(form));
            }}
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="key-name" className="text-xs font-medium text-ink-2">
                Name
              </label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                required
                placeholder="Claude Code"
                autoComplete="off"
              />
              <p className="text-xs text-ink-3">Shown on everything the agent does, like “Elliot via Claude Code”.</p>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-xs font-medium text-ink-2">What it can do</legend>
              <RadioGroup value={access} onValueChange={(v) => setAccess(v as Access)}>
                {levels.map((l) => (
                  <Radio key={l.value} value={l.value} hint={l.hint}>
                    {l.label}
                  </Radio>
                ))}
              </RadioGroup>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-xs font-medium text-ink-2">Where</legend>
              <RadioGroup value={reach} onValueChange={(v) => setReach(v as "all" | "some")}>
                <Radio value="all" hint="Including workspaces you join later.">
                  All my workspaces
                </Radio>
                <Radio value="some">Only these</Radio>
              </RadioGroup>
              {reach === "some" ? (
                <ul className="ml-6.5 flex flex-col gap-2">
                  {workspaces.map((w) => (
                    <li key={w.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                        <Checkbox
                          checked={picked.includes(w.id)}
                          onCheckedChange={(on) =>
                            setPicked((list) => (on ? [...list, w.id] : list.filter((x) => x !== w.id)))
                          }
                        />
                        {w.name}
                        <span className="font-mono text-[11px] text-ink-3">{w.slug}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
            </fieldset>
            {state && !state.ok ? <p className="text-xs text-hematite">{state.message}</p> : null}
            <Button type="submit" variant="primary" disabled={pending} className="self-end">
              {pending ? <Spinner className="[&>span.spin-cell]:bg-on-accent/40" /> : null} Make key
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Revoke({ agentKey }: { agentKey: AgentKey }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent title={`Revoke ${agentKey.name}?`} description="Agents using this key lose access straight away.">
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Keep it</Button>
          </DialogClose>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await revokeAgentKey(agentKey.id);
              setBusy(false);
              if (result) toast({ icon: result.ok ? "check" : "x", title: result.message, duration: 3000 });
            }}
          >
            {busy ? <Spinner className="[&>span.spin-cell]:bg-on-accent/40" /> : <Icon name="trash" />} Revoke
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AgentKeys({ keys, workspaces }: { keys: AgentKey[]; workspaces: KeyPlace[] }) {
  const names = new Map(workspaces.map((w) => [w.id, w.name]));
  return (
    <div>
      <p className="max-w-md text-sm text-ink-2">
        Let AI agents like Claude Code, Codex and Cursor read and update your boards over MCP. A key acts as you, so it
        only reaches workspaces you’re in.
      </p>
      {keys.length ? (
        <ul className="mt-5 flex flex-col border border-line">
          {keys.map((k) => (
            <li key={k.id} className="flex items-start gap-3 border-t border-line p-3 first:border-t-0">
              <span className="grid size-8 shrink-0 place-items-center border border-line bg-raised text-ink-2">
                <Icon name="sparkle" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{k.name}</span>
                  <Badge tone={k.access === "read" ? "stone" : k.access === "write" ? "lapis" : "pyrite"}>
                    {levelName[k.access]}
                  </Badge>
                </p>
                <p className="mt-0.5 text-xs text-ink-3">
                  {k.workspaces
                    ? k.workspaces
                        .map((id) => names.get(id))
                        .filter(Boolean)
                        .join(", ") || "No workspaces you’re still in"
                    : "All workspaces"}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                  acta_…{k.hint} · made {date(k.created_at)} · {k.used_at ? `last used ${date(k.used_at)}` : "never used"}
                </p>
              </div>
              <Revoke agentKey={k} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className={cn("flex flex-wrap items-center gap-3", keys.length ? "mt-4" : "mt-5")}>
        <NewKey workspaces={workspaces} />
        <span className="font-mono text-[11px] text-ink-3">{mcpUrl}</span>
      </div>
    </div>
  );
}
