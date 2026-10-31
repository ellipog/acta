"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { originOf } from "@/lib/roadmap-json";
import { loadClient } from "@/lib/supabase/browser";

// Roadmap keys build this board's public roadmap into another site, through the roadmap API. They reach only what
// the page shows, so they're shown in full, to copy again whenever they're needed

type RoadmapKey = {
  id: string;
  name: string;
  token: string;
  origins: string[];
  created_at: string;
  rotated_at: string | null;
  used_at: string | null;
};

const columns = "id, name, token, origins, created_at, rotated_at, used_at";
const MAX_KEYS = 10;

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function copy(text: string, what: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
  toast({ icon: "copy", title: `${what} copied`, duration: 2000 });
}

/** The sites typed into the box, one a line or split by commas, and any that aren't sites */
function readSites(text: string) {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  const origins = [...new Set(parts.map(originOf).filter((o): o is string => o !== null))];
  return { origins, bad: parts.filter((p) => originOf(p) === null) };
}

function problemOf(error: { code?: string; message?: string }) {
  if (error.code === "54000") return `A board can have ${MAX_KEYS} roadmap keys. Revoke one to make another.`;
  if (error.code === "42501") return "You can’t change this board’s public roadmap.";
  if (error.code === "23514") return "Check the name and sites. A key can list up to 10 sites.";
  return "That didn’t save. Try again.";
}

function KeyForm({
  title,
  start,
  submit,
  onSave,
  trigger,
}: {
  title: string;
  start?: RoadmapKey;
  submit: string;
  onSave: (name: string, origins: string[]) => Promise<string | null>;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(start?.name ?? "");
  const [sites, setSites] = useState(start?.origins.join("\n") ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { origins, bad } = readSites(sites);
  const tooMany = origins.length > 10;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) return;
        setName(start?.name ?? "");
        setSites(start?.origins.join("\n") ?? "");
        setProblem(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={title}
        description="Reaches only what the public page shows, so it can sit in a web page’s code."
        className="max-w-md"
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (bad.length || tooMany || !name.trim()) return;
            setBusy(true);
            const failed = await onSave(name.trim(), origins);
            setBusy(false);
            if (failed) setProblem(failed);
            else setOpen(false);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="roadmap-key-name" className="text-xs font-medium text-ink-2">
              Name
            </label>
            <Input
              id="roadmap-key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              required
              placeholder="Our website"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="roadmap-key-sites" className="text-xs font-medium text-ink-2">
              Sites
            </label>
            <Textarea
              id="roadmap-key-sites"
              value={sites}
              onChange={(e) => setSites(e.target.value)}
              spellCheck={false}
              placeholder={"https://yourco.com\nhttps://app.yourco.com"}
              aria-invalid={bad.length > 0 || tooMany}
              className="min-h-20 font-mono text-[12px]"
            />
            <p className={bad.length || tooMany ? "text-xs text-hematite" : "text-xs text-ink-3"}>
              {bad.length
                ? `${bad[0]} isn’t a site. Use addresses like https://yourco.com.`
                : tooMany
                  ? "A key can list up to 10 sites."
                  : "The sites whose pages may call it, one a line. Leave it empty for any site. Servers can always call it."}
            </p>
          </div>
          {problem ? <p className="text-xs text-hematite">{problem}</p> : null}
          <Button
            type="submit"
            variant="primary"
            disabled={busy || !name.trim() || bad.length > 0 || tooMany}
            className="self-end"
          >
            {busy ? <Spinner className="[&>span.spin-cell]:bg-on-accent/40" /> : null} {submit}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Confirm({
  title,
  description,
  action,
  icon,
  danger,
  label,
  onConfirm,
}: {
  title: string;
  description: string;
  action: string;
  icon: "reset" | "trash";
  danger?: boolean;
  label: string;
  onConfirm: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip content={label}>
        <DialogTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={label}>
            <Icon name={icon} />
          </Button>
        </DialogTrigger>
      </Tooltip>
      <DialogContent title={title} description={description}>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant={danger ? "danger" : "primary"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const done = await onConfirm();
              setBusy(false);
              if (done) setOpen(false);
            }}
          >
            {busy ? <Spinner className="[&>span.spin-cell]:bg-on-accent/40" /> : <Icon name={icon} />} {action}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RoadmapKeys({ boardId, canManage, isPublic }: { boardId: string; canManage: boolean; isPublic: boolean }) {
  const [keys, setKeys] = useState<RoadmapKey[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    let gone = false;
    void loadClient().then(async (db) => {
      const { data, error } = await db
        .from("roadmap_keys")
        .select(columns)
        .eq("board_id", boardId)
        .order("created_at");
      if (gone) return;
      if (error) setFailed(true);
      else setKeys(data as RoadmapKey[]);
    });
    return () => {
      gone = true;
    };
  }, [boardId, canManage]);

  const replace = (k: RoadmapKey) => setKeys((list) => list?.map((x) => (x.id === k.id ? k : x)) ?? [k]);

  const create = async (name: string, origins: string[]) => {
    const db = await loadClient();
    const { data, error } = await db.rpc("create_roadmap_key", { p_board: boardId, p_name: name, p_origins: origins });
    if (error) return problemOf(error);
    const made = data as Omit<RoadmapKey, "rotated_at" | "used_at">;
    setKeys((list) => [...(list ?? []), { ...made, rotated_at: null, used_at: null }]);
    toast({ icon: "check", title: "Key made", description: "Copy it into your site’s code.", duration: 2600 });
    return null;
  };

  const edit = (k: RoadmapKey) => async (name: string, origins: string[]) => {
    const db = await loadClient();
    const { data, error } = await db
      .from("roadmap_keys")
      .update({ name, origins })
      .eq("id", k.id)
      .select(columns)
      .single();
    if (error) return problemOf(error);
    replace(data as RoadmapKey);
    return null;
  };

  const rotate = (k: RoadmapKey) => async () => {
    const db = await loadClient();
    const { data, error } = await db.rpc("rotate_roadmap_key", { p_key: k.id });
    if (error) {
      toast({ icon: "x", title: "The key didn’t rotate", description: problemOf(error), duration: 3000 });
      return false;
    }
    replace({ ...k, token: data as string, rotated_at: new Date().toISOString() });
    toast({ icon: "check", title: "Key rotated", description: "Put the new one in your site’s code.", duration: 2600 });
    return true;
  };

  const revoke = (k: RoadmapKey) => async () => {
    const db = await loadClient();
    const { error } = await db.from("roadmap_keys").delete().eq("id", k.id);
    if (error) {
      toast({ icon: "x", title: "The key wasn’t revoked", description: problemOf(error), duration: 3000 });
      return false;
    }
    setKeys((list) => list?.filter((x) => x.id !== k.id) ?? null);
    toast({ icon: "check", title: `${k.name} revoked`, duration: 2000 });
    return true;
  };

  return (
    <>
      <p className="text-[11px] text-ink-3">
        Build this roadmap into your own site, with votes and ideas, through the roadmap API. Its keys reach only what
        this page shows.{" "}
        <a href="/docs/roadmap-api" target="_blank" className="underline underline-offset-2 hover:text-ink">
          How it works
        </a>
      </p>
      {!canManage ? (
        <p className="text-[11px] text-ink-3">Only people who can change the public roadmap can make keys.</p>
      ) : failed ? (
        <p className="text-[11px] text-hematite">The keys couldn’t be loaded. Try again later.</p>
      ) : keys === null ? (
        <Spinner />
      ) : (
        <>
          {!isPublic && keys.length ? (
            <p className="text-[11px] text-ink-3">Keys answer once the roadmap is public.</p>
          ) : null}
          {keys.length ? (
            <ul className="flex flex-col border border-line">
              {keys.map((k) => (
                <li key={k.id} className="flex flex-col gap-1 border-t border-line p-2.5 first:border-t-0">
                  <div className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{k.name}</span>
                    <KeyForm
                      title={`Edit ${k.name}`}
                      start={k}
                      submit="Save"
                      onSave={edit(k)}
                      trigger={
                        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${k.name}`}>
                          <Icon name="pencil" />
                        </Button>
                      }
                    />
                    <Confirm
                      label={`Rotate ${k.name}`}
                      title={`Rotate ${k.name}?`}
                      description="It gets a new key, and the one it has now stops working straight away. Sites using it need the new one."
                      action="Rotate"
                      icon="reset"
                      onConfirm={rotate(k)}
                    />
                    <Confirm
                      label={`Revoke ${k.name}`}
                      title={`Revoke ${k.name}?`}
                      description="Sites using this key stop getting the roadmap straight away."
                      action="Revoke"
                      icon="trash"
                      danger
                      onConfirm={revoke(k)}
                    />
                  </div>
                  <div className="flex items-center gap-1 border border-line bg-sunken">
                    <code className="min-w-0 flex-1 truncate px-2 font-mono text-[11px] text-ink-2">{k.token}</code>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Copy ${k.name}`}
                      onClick={() => copy(k.token, "Key")}
                    >
                      <Icon name="copy" />
                    </Button>
                  </div>
                  <p className="font-mono text-[11px] text-ink-3">
                    {k.origins.length ? k.origins.map((o) => o.replace(/^https?:\/\//, "")).join(", ") : "Any site"}
                  </p>
                  <p className="font-mono text-[11px] text-ink-3">
                    {k.rotated_at ? `rotated ${date(k.rotated_at)}` : `made ${date(k.created_at)}`} ·{" "}
                    {k.used_at ? `last used ${date(k.used_at)}` : "never used"}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          {keys.length < MAX_KEYS ? (
            <KeyForm
              title="New roadmap key"
              submit="Make key"
              onSave={create}
              trigger={
                <Button size="sm" className="self-start">
                  <Icon name="plus" /> New key
                </Button>
              }
            />
          ) : null}
        </>
      )}
    </>
  );
}
