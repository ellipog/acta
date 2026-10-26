"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, Eyebrow, Spinner } from "@/components/ui/display";
import { DitherFill } from "@/components/ui/dither";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/overlays";
import { PixelCaret } from "@/components/ui/pixel";
import { toast } from "@/components/ui/toast";
import {
  deleteBoard,
  deleteWorkspace,
  leaveWorkspace,
  removeMember,
  renameBoard,
  resetInviteLink,
  saveBoardMeta,
  setRole,
  updateWorkspace,
  type ActionResult,
} from "@/lib/actions";
import type { Label, Project, Tone } from "@/lib/board-store";
import { roleLabel, type Me, type Member, type Role, type WorkspaceSummary } from "@/lib/live";
import { publicHost, SLUG_MAX, slugify, slugProblem } from "@/lib/slugs";
import { cn } from "@/lib/utils";

type BoardInfo = { id: string; slug: string; name: string; labels: Label[]; projects: Project[] };

const roleHint: Record<Role, string> = {
  owner: "Everything, including deleting the workspace",
  admin: "Manage members, boards and settings",
  member: "Work on every board",
};

const toneClass: Record<Tone | "ink", string> = {
  lapis: "bg-lapis",
  pyrite: "bg-pyrite",
  malachite: "bg-malachite",
  hematite: "bg-hematite",
  ink: "bg-ink",
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line py-8 sm:grid-cols-[12rem_1fr]">
      <div>
        <h2 className="font-mono text-[11px] tracking-[0.12em] text-ink-3 uppercase">{title}</h2>
        {hint ? <p className="mt-2 text-xs text-ink-3">{hint}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Status({ result, idle }: { result: ActionResult; idle?: string }) {
  if (!result) return idle ? <p className="text-xs text-ink-3">{idle}</p> : null;
  return (
    <p role="status" className={cn("text-xs", result.ok ? "text-malachite" : "text-hematite")}>
      {result.message}
    </p>
  );
}

const say = (r: ActionResult) => {
  if (r) toast({ icon: r.ok ? "check" : "x", title: r.message, duration: 2400 });
};

export function SettingsView({
  me,
  workspace,
  members,
  boards,
  invite,
}: {
  me: Me;
  workspace: WorkspaceSummary;
  members: Member[];
  boards: BoardInfo[];
  invite: string | null;
}) {
  const manager = workspace.role !== "member";
  const owner = workspace.role === "owner";

  return (
    <div>
      <div className="flex items-center gap-5 pb-10">
        <Avatar name={workspace.name} sigil={workspace.sigil} tone={workspace.tone} size="xl" />
        <div className="min-w-0">
          <Eyebrow>Workspace settings</Eyebrow>
          <h1 className="mt-2 truncate font-display text-4xl">{workspace.name}</h1>
          <p className="mt-1 text-sm text-ink-2">
            You’re {workspace.role === "member" ? "a" : "an"} {roleLabel[workspace.role].toLowerCase()} here.
          </p>
        </div>
      </div>

      <Section title="General" hint={manager ? undefined : "Only owners and admins can change these."}>
        <General workspace={workspace} disabled={!manager} />
      </Section>

      <Section title="Members" hint={`${members.length} ${members.length === 1 ? "person" : "people"}`}>
        {invite ? <Invite workspace={workspace} url={invite} /> : null}
        <ul className="divide-y divide-line border-y border-line">
          {members.map((m) => (
            <MemberRow key={m.id} member={m} me={me} workspace={workspace} />
          ))}
        </ul>
      </Section>

      <Section title="Boards" hint="Labels and projects are set per board.">
        {boards.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {boards.map((b) => (
              <BoardRow key={b.id} board={b} workspace={workspace} canDelete={manager} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">No boards yet.</p>
        )}
      </Section>

      <Section title="Leave or delete">
        <div className="flex flex-wrap gap-2">
          <Leave workspace={workspace} lastOwner={owner && members.filter((m) => m.role === "owner").length === 1} />
          {owner ? <DeleteWorkspace workspace={workspace} /> : null}
        </div>
      </Section>
    </div>
  );
}

function General({ workspace, disabled }: { workspace: WorkspaceSummary; disabled: boolean }) {
  const [result, action, pending] = useActionState(updateWorkspace, null);
  const [slug, setSlug] = useState(workspace.slug);
  const problem = slug === workspace.slug ? null : slugProblem(slug.replace(/-+$/, ""));
  return (
    <form action={action} className="flex max-w-md flex-col gap-4">
      <input type="hidden" name="workspace" value={workspace.id} />
      <input type="hidden" name="before" value={workspace.slug} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ws-name" className="text-xs font-medium text-ink-2">
          Name
        </label>
        <Input id="ws-name" name="name" defaultValue={workspace.name} maxLength={60} required disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ws-slug" className="text-xs font-medium text-ink-2">
          Address
        </label>
        <div
          className={cn(
            "flex h-9 items-center border bg-raised text-sm focus-within:ring-2",
            problem
              ? "border-hematite focus-within:ring-hematite/25"
              : "border-line-strong focus-within:border-lapis focus-within:ring-lapis/25",
            disabled && "opacity-50",
          )}
        >
          <span className="shrink-0 border-r border-line bg-sunken px-2 font-mono text-[11px] leading-[2.15rem] text-ink-3">
            {publicHost}/
          </span>
          <input
            id="ws-slug"
            name="slug"
            value={slug}
            disabled={disabled}
            maxLength={SLUG_MAX}
            spellCheck={false}
            aria-invalid={Boolean(problem)}
            onChange={(e) => setSlug(slugify(e.target.value))}
            onBlur={() => setSlug((s) => s.replace(/-+$/, ""))}
            className="h-full min-w-0 flex-1 bg-transparent px-2 font-mono text-[13px] outline-none"
          />
        </div>
        <p className={cn("text-[11px]", problem ? "text-hematite" : "text-ink-3")}>
          {problem ?? "Changing it changes the links to your boards and public roadmaps."}
        </p>
      </div>
      {disabled ? null : (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending || Boolean(problem)}>
            {pending ? <Spinner /> : null} Save
          </Button>
          <Status result={result} />
        </div>
      )}
    </form>
  );
}

function Invite({ workspace, url }: { workspace: WorkspaceSummary; url: string }) {
  const [pending, start] = useTransition();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({
        icon: "link",
        title: "Invite link copied",
        description: "Anyone with it can join as a member.",
        duration: 2400,
      });
    } catch {
      toast({ icon: "x", title: "Couldn’t copy", description: "Select the link and copy it yourself." });
    }
  };
  return (
    <div className="relative isolate mb-6">
      <DitherFill level={50} tone="line" className="absolute inset-0 -z-10 translate-x-1.5 translate-y-1.5" />
      <div className="border border-ink bg-raised p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Icon name="link" size="sm" className="text-lapis" /> Invite people
        </p>
        <p className="mt-1 text-xs text-ink-3">
          Send this link to anyone you want in {workspace.name}. They join as members.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
            aria-label="Invite link"
          />
          <Button onClick={copy} variant="primary">
            <Icon name="copy" /> Copy
          </Button>
        </div>
        <Dialog>
          <DialogTrigger className="mt-3 flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink">
            <Icon name="reset" size="sm" /> Reset the link
          </DialogTrigger>
          <DialogContent
            title="Reset the invite link?"
            description="The current link stops working. People who already joined stay."
          >
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  variant="primary"
                  disabled={pending}
                  onClick={() => start(async () => say(await resetInviteLink(workspace.id)))}
                >
                  Reset link
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function MemberRow({ member, me, workspace }: { member: Member; me: Me; workspace: WorkspaceSummary }) {
  const [pending, start] = useTransition();
  const self = member.id === me.id;
  const mine = workspace.role;
  const canEdit = !self && (mine === "owner" || (mine === "admin" && member.role !== "owner"));
  const roles: Role[] = mine === "owner" ? ["owner", "admin", "member"] : ["admin", "member"];
  const joined = new Date(member.joined).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <li className="flex items-center gap-3 py-3">
      <Avatar name={member.name} src={member.avatar} tone={member.tone} size="md" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          {member.name}
          {self ? <Badge tone="lapis">You</Badge> : null}
        </p>
        <p className="text-xs text-ink-3">Joined {joined}</p>
      </div>
      {pending ? <Spinner /> : null}
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 items-center gap-2 border border-line bg-raised px-2.5 text-xs outline-none hover:border-line-strong focus-visible:ring-2 focus-visible:ring-lapis data-[state=open]:border-line-strong">
            {roleLabel[member.role]}
            <PixelCaret className="text-ink-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Role</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={member.role}
              onValueChange={(v) => start(async () => say(await setRole(workspace.id, member.id, v as Role)))}
            >
              {roles.map((r) => (
                <DropdownMenuRadioItem key={r} value={r} className="items-start">
                  <span>
                    <span className="block">{roleLabel[r]}</span>
                    <span className="block text-[11px] text-ink-3">{roleHint[r]}</span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="px-2.5 text-xs text-ink-3">{roleLabel[member.role]}</span>
      )}
      {canEdit ? (
        <Dialog>
          <DialogTrigger
            aria-label={`Remove ${member.name}`}
            className="grid size-8 place-items-center text-ink-3 hover:bg-hematite-soft hover:text-hematite"
          >
            <Icon name="x" />
          </DialogTrigger>
          <DialogContent
            title={`Remove ${member.name}?`}
            description="They lose access to every board here. Their tasks stay, unassigned."
          >
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  variant="danger"
                  onClick={() => start(async () => say(await removeMember(workspace.id, member.id)))}
                >
                  Remove
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <span className="size-8" />
      )}
    </li>
  );
}

function BoardRow({
  board,
  workspace,
  canDelete,
}: {
  board: BoardInfo;
  workspace: WorkspaceSummary;
  canDelete: boolean;
}) {
  const [deleted, del, deleting] = useActionState(deleteBoard, null);
  const [confirm, setConfirm] = useState("");
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="grid size-8 place-items-center border border-line bg-raised text-ink-2">
        <Icon name="board" size="sm" />
      </span>
      <div className="min-w-0 flex-1">
        <Link href={`/${workspace.slug}/${board.slug}`} className="block truncate text-sm font-medium hover:text-lapis">
          {board.name}
        </Link>
        <p className="truncate font-mono text-[11px] text-ink-3">
          {board.labels.length} labels · {board.projects.length} projects
        </p>
      </div>
      <BoardEditor board={board} />
      {canDelete ? (
        <Dialog onOpenChange={() => setConfirm("")}>
          <DialogTrigger
            aria-label={`Delete ${board.name}`}
            className="grid size-8 place-items-center text-ink-3 hover:bg-hematite-soft hover:text-hematite"
          >
            <Icon name="trash" />
          </DialogTrigger>
          <DialogContent
            title={`Delete ${board.name}?`}
            description="Every task, comment and vote on it goes too. This can’t be undone."
          >
            <form action={del} className="flex flex-col gap-3">
              <input type="hidden" name="board" value={board.id} />
              <input type="hidden" name="workspaceSlug" value={workspace.slug} />
              <label htmlFor={`confirm-${board.id}`} className="text-sm text-ink-2">
                Type <span className="font-mono text-ink">{board.name}</span> to confirm.
              </label>
              <Input
                id={`confirm-${board.id}`}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
              />
              {deleted && !deleted.ok ? <p className="text-xs text-hematite">{deleted.message}</p> : null}
              <Button
                type="submit"
                variant="danger"
                disabled={deleting || confirm.trim() !== board.name}
                className="self-end"
              >
                {deleting ? <Spinner className="[&>span.spin-cell]:bg-on-accent/40" /> : <Icon name="trash" />} Delete
                board
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </li>
  );
}

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

function BoardEditor({ board }: { board: BoardInfo }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(board.name);
  const [labels, setLabels] = useState(board.labels);
  const [projects, setProjects] = useState(board.projects);
  const [pending, start] = useTransition();
  const labelTones: Tone[] = ["lapis", "pyrite", "malachite", "hematite"];
  const projectTones: (Tone | "ink")[] = ["lapis", "pyrite", "malachite", "hematite", "ink"];

  const save = () =>
    start(async () => {
      if (name.trim() !== board.name) {
        const form = new FormData();
        form.set("board", board.id);
        form.set("name", name);
        const r = await renameBoard(null, form);
        if (r && !r.ok) return say(r);
      }
      const r = await saveBoardMeta(board.id, labels, projects);
      say(r);
      if (r?.ok) setOpen(false);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setName(board.name);
          setLabels(board.labels);
          setProjects(board.projects);
        }
      }}
    >
      <DialogTrigger className="flex h-8 items-center gap-1.5 border border-line bg-raised px-2.5 text-xs hover:border-line-strong">
        <Icon name="pencil" size="sm" /> Edit
      </DialogTrigger>
      <DialogContent
        title={`Edit ${board.name}`}
        description="Renaming a label doesn’t change tasks that already have it."
        className="max-w-xl"
      >
        <div className="flex max-h-[60vh] flex-col gap-6 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`name-${board.id}`} className="text-xs font-medium text-ink-2">
              Name
            </label>
            <Input id={`name-${board.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-ink-2">Labels</p>
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
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setLabels([...labels, { id: "", tone: labelTones[labels.length % labelTones.length] }])}
            >
              <Icon name="plus" /> Add label
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-ink-2">Projects</p>
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
                  onChange={(e) => setProjects(projects.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <Button
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
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() =>
                setProjects([...projects, { name: "", tone: projectTones[projects.length % projectTones.length] }])
              }
            >
              <Icon name="plus" /> Add project
            </Button>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button variant="primary" onClick={save} disabled={pending || !name.trim()}>
            {pending ? <Spinner className="[&>span.spin-cell]:bg-on-accent/40" /> : null} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Leave({ workspace, lastOwner }: { workspace: WorkspaceSummary; lastOwner: boolean }) {
  const [result, action, pending] = useActionState(leaveWorkspace, null);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Icon name="sign-out" /> Leave workspace
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Leave ${workspace.name}?`}
        description={
          lastOwner
            ? "You’re the only owner. Ownership passes to the longest-standing admin or member. If you’re the last person, the workspace is deleted."
            : "You lose access to its boards until someone invites you again."
        }
      >
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="workspace" value={workspace.id} />
          <Status result={result} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? <Spinner className="[&>span.spin-cell]:bg-on-accent/40" /> : null} Leave
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteWorkspace({ workspace }: { workspace: WorkspaceSummary }) {
  const [result, action, pending] = useActionState(deleteWorkspace, null);
  const [confirm, setConfirm] = useState("");
  return (
    <Dialog onOpenChange={() => setConfirm("")}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="border-hematite/40 text-hematite hover:bg-hematite-soft hover:text-hematite">
          <Icon name="trash" /> Delete workspace
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Delete ${workspace.name}?`}
        description="Every board, task, comment and member goes with it. This can’t be undone."
      >
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="workspace" value={workspace.id} />
          <label htmlFor="confirm-ws" className="text-sm text-ink-2">
            Type <span className="font-mono text-ink">{workspace.name}</span> to confirm.
          </label>
          <Input id="confirm-ws" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          <Status result={result} />
          <Button
            type="submit"
            variant="danger"
            disabled={pending || confirm.trim() !== workspace.name}
            className="self-end"
          >
            {pending ? <Spinner className="[&>span.spin-cell]:bg-on-accent/40" /> : <Icon name="trash" />} Delete
            forever
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
