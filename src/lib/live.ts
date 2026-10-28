import type { BoardMeta, BoardState, CustomField, Label, Person, Project, StatusNames, Tone } from "./board-store";
import type { DitherName } from "./dither-assets";

export type Role = "owner" | "admin" | "member" | "viewer";

// What someone may do in a workspace beyond seeing it. The database decides the same way, in public.can
export type Permission = "edit" | "delete" | "comment" | "boards" | "roadmap" | "invite";
// Only what differs from the role's defaults is stored
export type Permissions = Partial<Record<Permission, boolean>>;

export const permissionList: { id: Permission; label: string; hint: string }[] = [
  { id: "edit", label: "Edit tasks", hint: "Create, change, move and archive tasks" },
  { id: "delete", label: "Delete tasks", hint: "Delete tasks, which anyone who can edit can restore" },
  { id: "comment", label: "Comment and vote", hint: "Comment, vote and suggest ideas" },
  { id: "boards", label: "Manage boards", hint: "Create boards, rename them and change their labels and projects" },
  { id: "roadmap", label: "Public roadmap", hint: "Publish the roadmap, edit its page and decline ideas" },
  { id: "invite", label: "Invite people", hint: "See and share the invite link" },
];

export const isManager = (role: Role) => role === "owner" || role === "admin";

/** What a role allows when nothing is set for the person */
export function roleAllows(role: Role, what: Permission) {
  if (isManager(role)) return true;
  if (role === "member") return what !== "invite";
  return what === "comment";
}

export function can(role: Role, permissions: Permissions | null | undefined, what: Permission) {
  if (isManager(role)) return true;
  return permissions?.[what] ?? roleAllows(role, what);
}

export type WorkspaceSummary = {
  id: string;
  slug: string;
  name: string;
  sigil: DitherName;
  tone: Tone;
  // A picture of its own, shown instead of the sigil
  image?: string | null;
  role: Role;
  permissions?: Permissions;
};
// count is how many tasks the board holds and mine how many of them are yours and open, when they could be read
export type BoardSummary = { id: string; slug: string; name: string; count?: number; mine?: number };
export type Member = {
  id: string;
  name: string;
  avatar: string | null;
  role: Role;
  permissions?: Permissions;
  tone: Tone;
  joined: string;
};
export type Me = { id: string; name: string; email: string; avatar: string | null };

export type LiveBoard = {
  me: Me;
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  boards: BoardSummary[];
  members: Member[];
  board: {
    id: string;
    slug: string;
    name: string;
    prefix: string;
    labels: Label[];
    projects: Project[];
    fields: CustomField[];
    statusNames: StatusNames;
  };
  state: BoardState;
  // When the server read the board, so the browser only asks for what changed after it
  at: number;
};

const tones: Tone[] = ["lapis", "pyrite", "malachite", "hematite"];
export const workspaceTones = tones;

// The crystals a workspace can wear when it has no picture
export const sigils: DitherName[] = [
  "crystal-cluster",
  "crystal-shard",
  "crystal-prism",
  "crystal-tablet",
  "crystal-rhomb",
  "crystal-lozenge",
  "crystal-column",
  "crystal-tower",
  "crystal-block",
];

export function toneFor(id: string): Tone {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return tones[Math.abs(h) % tones.length];
}

export const roleLabel: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" };

export function metaFor(live: LiveBoard): BoardMeta {
  const people: Person[] = live.members.map((m) => ({ id: m.id, name: m.name, tone: m.tone, avatar: m.avatar }));
  return {
    me: live.me.name,
    meId: live.me.id,
    people,
    labels: live.board.labels,
    projects: live.board.projects,
    fields: live.board.fields,
    statusNames: live.board.statusNames,
    workspace: live.workspace.slug,
    team: live.workspace.name,
    prefix: live.board.prefix,
    live: true,
  };
}
