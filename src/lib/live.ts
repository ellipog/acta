import type { BoardMeta, BoardState, Label, Person, Project, Tone } from "./board-store";
import type { DitherName } from "./dither-assets";

export type Role = "owner" | "admin" | "member";

export type WorkspaceSummary = { id: string; slug: string; name: string; sigil: DitherName; tone: Tone; role: Role };
export type BoardSummary = { id: string; slug: string; name: string };
export type Member = { id: string; name: string; avatar: string | null; role: Role; tone: Tone; joined: string };
export type Me = { id: string; name: string; email: string; avatar: string | null };

export type LiveBoard = {
  me: Me;
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  boards: BoardSummary[];
  members: Member[];
  board: { id: string; slug: string; name: string; prefix: string; labels: Label[]; projects: Project[] };
  state: BoardState;
};

const tones: Tone[] = ["lapis", "pyrite", "malachite", "hematite"];

export function toneFor(id: string): Tone {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return tones[Math.abs(h) % tones.length];
}

export const roleLabel: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member" };

export function metaFor(live: LiveBoard): BoardMeta {
  const people: Person[] = live.members.map((m) => ({ id: m.id, name: m.name, tone: m.tone, avatar: m.avatar }));
  return {
    me: live.me.name,
    meId: live.me.id,
    people,
    labels: live.board.labels,
    projects: live.board.projects,
    workspace: live.workspace.slug,
    team: live.workspace.name,
    prefix: live.board.prefix,
    live: true,
  };
}
