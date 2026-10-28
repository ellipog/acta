"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useOptimistic, useRef, useState, useTransition } from "react";
import { BoardEditor, DeleteBoardDialog } from "@/components/board-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, Eyebrow, Spinner } from "@/components/ui/display";
import { DitherFill } from "@/components/ui/dither";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PixelCaret } from "@/components/ui/pixel";
import { toast } from "@/components/ui/toast";
import {
  deleteWorkspace,
  leaveWorkspace,
  removeMember,
  resetInviteLink,
  setPermissions,
  setRole,
  setWorkspaceImage,
  setWorkspaceLook,
  updateWorkspace,
  type ActionResult,
} from "@/lib/actions";
import { removeBoard, saveBoard } from "@/lib/board-actions";
import { boardIcon } from "@/lib/board-icons";
import { useBoardEdits } from "@/lib/board-edits";
import { GitHubSection, type GitHubInfo } from "./github-section";
import type { Label, Project, Tone } from "@/lib/board-store";
import type { DitherName } from "@/lib/dither-assets";
import {
  can,
  isManager,
  permissionList,
  roleAllows,
  roleLabel,
  sigils,
  workspaceTones,
  type Me,
  type Member,
  type Permission,
  type Permissions,
  type Role,
  type WorkspaceSummary,
} from "@/lib/live";
import { siteHost, SLUG_MAX, slugify, slugProblem } from "@/lib/slugs";
import { square } from "@/lib/square-image";
import { cn } from "@/lib/utils";

type BoardInfo = { id: string; slug: string; name: string; icon?: string; labels: Label[]; projects: Project[] };

const roleHint: Record<Role, string> = {
  owner: "Everything, including deleting the workspace",
  admin: "Everything else: members, boards and settings",
  member: "Work on every board. Fine-tune with Permissions",
  viewer: "See every board, comment and vote. Fine-tune with Permissions",
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

// Changes show at once and only a failure speaks up, since the change on screen already says it worked
const sayFailure = (r: ActionResult) => {
  if (r && !r.ok) toast({ icon: "x", title: r.message, description: "Your change was undone." });
};

export function SettingsView({
  me,
  workspace,
  members: everyone,
  boards: saved,
  invite,
  github,
}: {
  me: Me;
  workspace: WorkspaceSummary;
  members: Member[];
  boards: BoardInfo[];
  invite: string | null;
  github: GitHubInfo | null;
}) {
  const manager = isManager(workspace.role);
  const owner = workspace.role === "owner";
  const [name, setName] = useOptimistic(workspace.name);
  const [look, setLook] = useOptimistic<Look>({
    sigil: workspace.sigil,
    tone: workspace.tone,
    image: workspace.image ?? null,
  });
  const [members, drop] = useOptimistic(everyone, (list, id: string) => list.filter((m) => m.id !== id));
  const [, start] = useTransition();
  const edits = useBoardEdits().boards;
  const boards = saved
    .filter((b) => !edits[b.id]?.gone)
    .map((b) => {
      const e = edits[b.id];
      if (!e) return b;
      return {
        ...b,
        name: e.name ?? b.name,
        icon: e.icon ?? b.icon,
        slug: e.slug ?? b.slug,
        labels: e.labels ?? b.labels,
        projects: e.projects ?? b.projects,
      };
    });

  return (
    <div>
      <div className="flex items-center gap-5 pb-10">
        <Avatar name={name} sigil={look.sigil} tone={look.tone} src={look.image} size="xl" />
        <div className="min-w-0">
          <Eyebrow>Workspace settings</Eyebrow>
          <h1 className="mt-2 truncate font-display text-4xl">{name}</h1>
          <p className="mt-1 text-sm text-ink-2">
            You’re {isManager(workspace.role) ? "an" : "a"} {roleLabel[workspace.role].toLowerCase()} here.
          </p>
        </div>
      </div>

      <Section title="General" hint={manager ? undefined : "Only owners and admins can change these."}>
        <div className="flex flex-col gap-6">
          <LookField workspace={workspace} name={name} look={look} setLook={setLook} disabled={!manager} />
          <General workspace={workspace} disabled={!manager} onName={setName} />
        </div>
      </Section>

      <Section title="Members" hint={`${members.length} ${members.length === 1 ? "person" : "people"}`}>
        {invite ? <Invite workspace={workspace} url={invite} canReset={manager} /> : null}
        <ul className="divide-y divide-line border-y border-line">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              me={me}
              workspace={workspace}
              onRemove={() =>
                start(async () => {
                  drop(m.id);
                  const r = await removeMember(workspace.id, m.id);
                  if (r?.ok) toast({ icon: "check", title: `Removed ${m.name}`, duration: 2400 });
                  else sayFailure(r);
                })
              }
            />
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

      {github ? (
        <div id="github" className="scroll-mt-16">
          <Section title="GitHub" hint="Repositories linked to boards. Name a task, like ACT-12, in a branch or pull request.">
            <GitHubSection
              workspace={workspace.id}
              slug={workspace.slug}
              boards={boards}
              info={github}
              manager={manager}
            />
          </Section>
        </div>
      ) : null}

      <Section title="Leave or delete">
        <div className="flex flex-wrap gap-2">
          <Leave workspace={workspace} lastOwner={owner && members.filter((m) => m.role === "owner").length === 1} />
          {owner ? <DeleteWorkspace workspace={workspace} /> : null}
        </div>
      </Section>
    </div>
  );
}

type Look = { sigil: DitherName; tone: Tone; image: string | null };

const toneSwatch: Record<Tone, string> = {
  lapis: "bg-lapis",
  pyrite: "bg-pyrite",
  malachite: "bg-malachite",
  hematite: "bg-hematite",
};

// The workspace's picture, or the crystal and colour it wears without one. Each change shows at once and saves
// behind it
function LookField({
  workspace,
  name,
  look,
  setLook,
  disabled,
}: {
  workspace: WorkspaceSummary;
  name: string;
  look: Look;
  setLook: (look: Look) => void;
  disabled: boolean;
}) {
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const sendImage = (picture: Blob | null, shown: string | null) =>
    start(async () => {
      setProblem(null);
      setLook({ ...look, image: shown });
      const form = new FormData();
      form.set("workspace", workspace.id);
      form.set("source", picture ? "upload" : "none");
      if (picture) form.set("picture", picture, "picture");
      const r = await setWorkspaceImage(form);
      if (r && !r.ok) setProblem(r.message);
    });

  const pick = async (file?: File) => {
    if (!file || disabled) return;
    if (!file.type.startsWith("image/")) return setProblem("That isn’t an image.");
    if (file.size > 20 * 1024 * 1024) return setProblem("Pick an image under 20 MB.");
    try {
      const blob = await square(file);
      sendImage(blob, URL.createObjectURL(blob));
    } catch {
      setProblem("We couldn’t read that image. Try a PNG or JPG.");
    }
  };

  const choose = (patch: Partial<Pick<Look, "sigil" | "tone">>) =>
    start(async () => {
      setLook({ ...look, ...patch });
      sayFailure(await setWorkspaceLook(workspace.id, patch));
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-ink-2">Picture</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Upload a picture for the workspace"
            disabled={disabled || pending}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!disabled) setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void pick(e.dataTransfer.files[0]);
            }}
            className={cn(
              "group relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-lapis focus-visible:ring-offset-2 focus-visible:ring-offset-page disabled:cursor-default",
              over && "ring-2 ring-lapis ring-offset-2 ring-offset-page",
            )}
          >
            <Avatar name={name} sigil={look.sigil} tone={look.tone} src={look.image} size="xl" />
            {disabled ? null : (
              <span
                className={cn(
                  "absolute inset-0 grid place-items-center bg-ink/60 text-page opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
                  (over || pending) && "opacity-100",
                  pending && "bg-page/60 text-ink",
                )}
              >
                {pending ? <Spinner /> : <Icon name="upload" />}
              </span>
            )}
          </button>
          {disabled ? null : (
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending} onClick={() => input.current?.click()}>
                <Icon name="upload" /> Upload
              </Button>
              {look.image ? (
                <Button variant="ghost" disabled={pending} onClick={() => sendImage(null, null)}>
                  Remove
                </Button>
              ) : null}
            </div>
          )}
        </div>
        <p role="status" className={cn("text-xs", problem ? "text-hematite" : "text-ink-3")}>
          {problem ?? "PNG, JPG or WebP, cropped to a square. It shows in the sidebar and on public roadmaps."}
        </p>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          hidden
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-ink-2">
          Sigil {look.image ? <span className="font-normal text-ink-3">· shown when there’s no picture</span> : null}
        </span>
        <div role="radiogroup" aria-label="Sigil" className="flex flex-wrap gap-1.5">
          {sigils.map((sigil) => (
            <button
              key={sigil}
              role="radio"
              aria-checked={look.sigil === sigil}
              aria-label={sigil.replace("crystal-", "")}
              disabled={disabled}
              onClick={() => look.sigil !== sigil && choose({ sigil })}
              className={cn(
                "p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-lapis disabled:opacity-60",
                look.sigil === sigil ? "ring-2 ring-ink" : "hover:ring-1 hover:ring-line-strong",
              )}
            >
              <Avatar name={name} sigil={sigil} tone={look.tone} size="md" />
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Colour" className="mt-1 flex gap-1.5">
          {workspaceTones.map((tone) => (
            <button
              key={tone}
              role="radio"
              aria-checked={look.tone === tone}
              aria-label={tone}
              disabled={disabled}
              onClick={() => look.tone !== tone && choose({ tone })}
              className={cn(
                "grid size-7 place-items-center outline-none focus-visible:ring-2 focus-visible:ring-lapis disabled:opacity-60",
                look.tone === tone ? "ring-2 ring-ink" : "hover:ring-1 hover:ring-line-strong",
              )}
            >
              <span className={cn("size-5", toneSwatch[tone])} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function General({
  workspace,
  disabled,
  onName,
}: {
  workspace: WorkspaceSummary;
  disabled: boolean;
  onName: (name: string) => void;
}) {
  // The new name shows at once. A new address waits, since it moves the page
  const [result, action, pending] = useActionState(async (before: ActionResult, form: FormData) => {
    const name = String(form.get("name") ?? "").trim();
    if (name) onName(name);
    const r = await updateWorkspace(before, form);
    sayFailure(r);
    return r?.ok ? null : r;
  }, null);
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
            {siteHost}/
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
          <Button type="submit" disabled={Boolean(problem) || (pending && slug !== workspace.slug)}>
            {pending && slug !== workspace.slug ? <Spinner /> : null} Save
          </Button>
          <Status result={result} />
        </div>
      )}
    </form>
  );
}

function Invite({ workspace, url, canReset }: { workspace: WorkspaceSummary; url: string; canReset: boolean }) {
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
        {canReset ? (
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
        ) : null}
      </div>
    </div>
  );
}

function MemberRow({
  member,
  me,
  workspace,
  onRemove,
}: {
  member: Member;
  me: Me;
  workspace: WorkspaceSummary;
  onRemove: () => void;
}) {
  const [, start] = useTransition();
  const [role, setOptimisticRole] = useOptimistic(member.role);
  const [perms, setOptimisticPerms] = useOptimistic(member.permissions ?? {});
  const self = member.id === me.id;
  const mine = workspace.role;
  const canEdit = !self && (mine === "owner" || (mine === "admin" && member.role !== "owner"));
  const roles: Role[] = mine === "owner" ? ["owner", "admin", "member", "viewer"] : ["admin", "member", "viewer"];
  const joined = new Date(member.joined).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  // What this person can or can't do that differs from their role
  const tuned = isManager(role)
    ? []
    : permissionList.filter((p) => can(role, perms, p.id) !== roleAllows(role, p.id));

  return (
    <li className="flex items-center gap-3 py-3">
      <Avatar name={member.name} src={member.avatar} tone={member.tone} size="md" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          {member.name}
          {self ? <Badge tone="lapis">You</Badge> : null}
        </p>
        <p className="truncate text-xs text-ink-3">
          Joined {joined}
          {tuned.map((p) => (
            <span key={p.id}>
              {" · "}
              {perms[p.id] ? "Can" : "Can’t"} {p.label.toLowerCase()}
            </span>
          ))}
        </p>
      </div>
      {canEdit && !isManager(role) ? (
        <PermissionsMenu
          name={member.name}
          role={role}
          permissions={perms}
          onChange={(next) =>
            start(async () => {
              setOptimisticPerms(next);
              sayFailure(await setPermissions(workspace.id, member.id, next));
            })
          }
        />
      ) : null}
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 items-center gap-2 border border-line bg-raised px-2.5 text-xs outline-none hover:border-line-strong focus-visible:ring-2 focus-visible:ring-lapis data-[state=open]:border-line-strong">
            {roleLabel[role]}
            <PixelCaret className="text-ink-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Role</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={role}
              onValueChange={(v) =>
                start(async () => {
                  setOptimisticRole(v as Role);
                  setOptimisticPerms({});
                  sayFailure(await setRole(workspace.id, member.id, v as Role));
                })
              }
            >
              {roles.map((r) => (
                // Two lines need more than a menu row's usual height
                <DropdownMenuRadioItem key={r} value={r} className="h-auto min-h-8 items-start py-1.5">
                  <span className="min-w-0">
                    <span className="block">{roleLabel[r]}</span>
                    <span className="block text-[11px] leading-snug text-ink-3">{roleHint[r]}</span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="px-2.5 text-xs text-ink-3">{roleLabel[role]}</span>
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
                <Button variant="danger" onClick={onRemove}>
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

// What a member or viewer can do, one switch each. Each starts from what the role allows, and only the
// differences are kept, so a later change to a role's defaults still reaches them
function PermissionsMenu({
  name,
  role,
  permissions,
  onChange,
}: {
  name: string;
  role: Role;
  permissions: Permissions;
  onChange: (next: Permissions) => void;
}) {
  const set = (id: Permission, on: boolean) => {
    const next = { ...permissions };
    if (on === roleAllows(role, id)) delete next[id];
    else next[id] = on;
    onChange(next);
  };
  const changed = permissionList.some((p) => can(role, permissions, p.id) !== roleAllows(role, p.id));
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`What ${name} can do`}
        className={cn(
          "flex h-8 items-center gap-1.5 border px-2.5 text-xs outline-none hover:border-line-strong focus-visible:ring-2 focus-visible:ring-lapis data-[state=open]:border-line-strong",
          changed ? "border-lapis/40 bg-lapis-soft text-lapis-ink" : "border-line bg-raised text-ink-2",
        )}
      >
        <Icon name="shield" size="sm" />
        <span className="hidden sm:inline">Permissions</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="border-b border-line px-3 py-2.5">
          <p className="text-sm font-medium">What {name} can do</p>
          <p className="mt-0.5 text-xs text-ink-3">
            Starts from what a {roleLabel[role].toLowerCase()} can do. Everyone here can see every board.
          </p>
        </div>
        <ul className="py-1">
          {permissionList.map((p) => {
            const on = can(role, permissions, p.id);
            const differs = on !== roleAllows(role, p.id);
            return (
              <li key={p.id}>
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-sunken">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm">
                      {p.label}
                      {differs ? <span className="font-mono text-[10px] text-lapis">changed</span> : null}
                    </span>
                    <span className="block text-[11px] leading-snug text-ink-3">{p.hint}</span>
                  </span>
                  <Switch checked={on} onCheckedChange={(v) => set(p.id, v)} className="mt-0.5" />
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end border-t border-line px-3 py-2">
          <button
            disabled={!changed}
            onClick={() => onChange({})}
            className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink disabled:opacity-40"
          >
            <Icon name="reset" size="sm" /> Back to what a {roleLabel[role].toLowerCase()} can do
          </button>
        </div>
      </PopoverContent>
    </Popover>
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
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ctx = { workspace: workspace.slug, current: false, router };
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="grid size-8 place-items-center border border-line bg-raised text-ink-2">
        <Icon name={boardIcon(board.icon)} size="sm" />
      </span>
      <div className="min-w-0 flex-1">
        <Link href={`/${workspace.slug}/${board.slug}`} className="block truncate text-sm font-medium hover:text-lapis">
          {board.name}
        </Link>
        <p className="truncate font-mono text-[11px] text-ink-3">
          {board.labels.length} labels · {board.projects.length} projects
        </p>
      </div>
      <button
        onClick={() => setEditing(true)}
        className="flex h-8 items-center gap-1.5 border border-line bg-raised px-2.5 text-xs hover:border-line-strong"
      >
        <Icon name="pencil" size="sm" /> Edit
      </button>
      <BoardEditor
        board={board}
        workspace={workspace.slug}
        open={editing}
        onOpenChange={setEditing}
        onSave={(change) => void saveBoard(board, change, ctx)}
      />
      {canDelete ? (
        <>
          <button
            aria-label={`Delete ${board.name}`}
            onClick={() => setDeleting(true)}
            className="grid size-8 place-items-center text-ink-3 hover:bg-hematite-soft hover:text-hematite"
          >
            <Icon name="trash" />
          </button>
          <DeleteBoardDialog
            board={board}
            open={deleting}
            onOpenChange={setDeleting}
            onDelete={() => void removeBoard(board, { ...ctx, next: null })}
          />
        </>
      ) : null}
    </li>
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
