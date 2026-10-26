"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useOptimistic, useRef, useState } from "react";
import { profileEvent } from "@/components/account-button";
import { Button } from "@/components/ui/button";
import { Avatar, Eyebrow, Spinner } from "@/components/ui/display";
import { Icon, type IconName } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import type { CurrentUser } from "@/lib/auth";
import { avatarSide } from "@/lib/avatars";
import { loadClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { changePicture, deleteAccount, rename, type Result } from "./actions";
import { AgentKeys, type AgentKey, type KeyPlace } from "./agent-keys";

const methods: Record<string, { label: string; icon: IconName }> = {
  email: { label: "Email link", icon: "mail" },
  google: { label: "Google", icon: "google" },
  github: { label: "GitHub", icon: "github" },
};

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("grid gap-4 border-t border-line py-8 sm:grid-cols-[12rem_1fr]", className)}>
      <h2 className="font-mono text-[11px] tracking-[0.12em] text-ink-3 uppercase">{title}</h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

async function square(file: File) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = avatarSide;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    avatarSide,
    avatarSide,
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/webp", 0.9));
  if (!blob) throw new Error("Couldn’t encode");
  return blob;
}

function PictureField({ user }: { user: CurrentUser }) {
  const [state, act, pending] = useActionState(changePicture, null);
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) window.dispatchEvent(new Event(profileEvent));
  }, [state]);

  const send = (source: string, picture?: Blob) => {
    setProblem(null);
    const form = new FormData();
    form.set("source", source);
    if (picture) form.set("picture", picture, "picture");
    startTransition(() => act(form));
  };

  const pick = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setProblem("That isn’t an image.");
    if (file.size > 20 * 1024 * 1024) return setProblem("Pick an image under 20 MB.");
    try {
      const blob = await square(file);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
      send("upload", blob);
    } catch {
      setProblem("We couldn’t read that image. Try a PNG or JPG.");
    }
  };

  const shown = pending && preview ? preview : user.avatar;
  const message = problem ?? state?.message;
  const failed = problem !== null || state?.ok === false;
  const others = user.pictures.filter((p) => p.url !== user.avatar);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-2">Picture</span>
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Upload a new picture"
          disabled={pending}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={cn(
            "group relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-lapis focus-visible:ring-offset-2 focus-visible:ring-offset-page",
            over && "ring-2 ring-lapis ring-offset-2 ring-offset-page",
          )}
        >
          <Avatar name={user.name} src={shown} size="xl" />
          <span
            className={cn(
              "absolute inset-0 grid place-items-center bg-ink/60 text-page opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
              (over || pending) && "opacity-100",
              pending && "bg-page/60 text-ink",
            )}
          >
            {pending ? <Spinner /> : <Icon name="upload" />}
          </span>
        </button>
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => input.current?.click()}>
            <Icon name="upload" /> Upload
          </Button>
          {others.map((p) => (
            <Button key={p.provider} variant="ghost" disabled={pending} onClick={() => send(p.provider)}>
              <Icon name={methods[p.provider]?.icon ?? "user"} /> Use {methods[p.provider]?.label ?? p.provider} picture
            </Button>
          ))}
          {user.avatar ? (
            <Button variant="ghost" disabled={pending} onClick={() => send("none")}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <p role="status" className={cn("text-xs", !message ? "text-ink-3" : failed ? "text-hematite" : "text-malachite")}>
        {message ?? "PNG, JPG or WebP, cropped to a square. Drop one on the picture or upload it."}
      </p>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        hidden
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function AccountView({
  user,
  keys,
  workspaces,
}: {
  user: CurrentUser;
  keys: AgentKey[];
  workspaces: KeyPlace[];
}) {
  // The new name shows at once and saves behind it
  const [name, setName] = useOptimistic(user.name);
  const [named, renameAction] = useActionState(async (before: Result, form: FormData) => {
    const next = String(form.get("name") ?? "").trim();
    if (next) setName(next.slice(0, 80));
    return rename(before, form);
  }, null);
  const [deleted, deleteAction, deleting] = useActionState(deleteAccount, null);
  const [confirm, setConfirm] = useState("");
  const [leaving, setLeaving] = useState(false);
  const router = useRouter();
  const joined = new Date(user.joined).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  useEffect(() => {
    if (named?.ok) window.dispatchEvent(new Event(profileEvent));
  }, [named]);

  return (
    <div>
      <div className="flex items-center gap-5 pb-10">
        <Avatar name={name} src={user.avatar} size="lg" />
        <div className="min-w-0">
          <Eyebrow>Account</Eyebrow>
          <h1 className="mt-2 truncate font-display text-4xl">{name}</h1>
          <p className="mt-1 truncate text-sm text-ink-2">{user.email}</p>
        </div>
      </div>

      {user.admin ? (
        <Link
          href="/admin"
          className="mb-8 flex items-center gap-4 border border-ink bg-raised p-4 transition-colors hover:bg-surface"
        >
          <span className="grid size-10 shrink-0 place-items-center border border-lapis bg-lapis-soft text-lapis">
            <Icon name="chart" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Analytics</span>
            <span className="block text-xs text-ink-3">Visitors, pages, sources and events. Only admins see this.</span>
          </span>
          <Icon name="arrow-right" className="text-ink-3" />
        </Link>
      ) : null}

      <Section title="Profile">
        <PictureField user={user} />
        <form action={renameAction} className="mt-8 flex max-w-md flex-col gap-1.5">
          <label htmlFor="name" className="text-xs font-medium text-ink-2">
            Name
          </label>
          <div className="flex gap-2">
            <Input id="name" name="name" defaultValue={user.name} maxLength={80} required autoComplete="name" />
            <Button type="submit">Save</Button>
          </div>
          {named ? (
            <p role="status" className={cn("text-xs", named.ok ? "text-malachite" : "text-hematite")}>
              {named.message}
            </p>
          ) : (
            <p className="text-xs text-ink-3">Shown on tasks, comments and the people you work with.</p>
          )}
        </form>
      </Section>

      <Section title="Signing in">
        <ul className="flex flex-col gap-2">
          {user.methods.map((m) => (
            <li key={m} className="flex items-center gap-3 text-sm">
              <span className="grid size-8 place-items-center border border-line bg-raised text-ink-2">
                <Icon name={methods[m]?.icon ?? "lock"} />
              </span>
              {methods[m]?.label ?? m}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-3">Member since {joined}.</p>
        <Button
          className="mt-5"
          disabled={leaving}
          onClick={async () => {
            setLeaving(true);
            await (await loadClient()).auth.signOut();
            router.replace("/");
            router.refresh();
          }}
        >
          {leaving ? <Spinner /> : <Icon name="sign-out" />} Sign out
        </Button>
      </Section>

      <Section title="Agents">
        <AgentKeys keys={keys} workspaces={workspaces} />
      </Section>

      <Section title="Delete account">
        <p className="max-w-md text-sm text-ink-2">
          Removes your account and profile straight away. Anything you’ve shared in a workspace stays with that
          workspace.
        </p>
        <Dialog onOpenChange={() => setConfirm("")}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              className="mt-4 border-hematite/40 text-hematite hover:bg-hematite-soft hover:text-hematite"
            >
              <Icon name="trash" /> Delete my account
            </Button>
          </DialogTrigger>
          <DialogContent title="Delete your account?" description="This can’t be undone.">
            <form action={deleteAction} className="flex flex-col gap-3">
              <label htmlFor="confirm" className="text-sm text-ink-2">
                Type <span className="font-mono text-ink">{user.email}</span> to confirm.
              </label>
              <Input
                id="confirm"
                name="confirm"
                autoComplete="off"
                spellCheck={false}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {deleted && !deleted.ok ? <p className="text-xs text-hematite">{deleted.message}</p> : null}
              <Button
                type="submit"
                variant="danger"
                disabled={deleting || confirm.trim().toLowerCase() !== user.email.toLowerCase()}
                className="self-end"
              >
                {deleting ? <Spinner className="[&>span.spin-cell]:bg-on-accent/40" /> : <Icon name="trash" />}
                Delete forever
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </Section>
    </div>
  );
}
