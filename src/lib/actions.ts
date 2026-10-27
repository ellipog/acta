"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { avatarBucket, imageType, maxAvatarBytes } from "./avatars";
import type { Tone } from "./board-store";
import type { DitherName } from "./dither-assets";
import { permissionList, sigils, workspaceTones, type Permissions, type Role } from "./live";
import { boardPrefixFor, boardSlugFor, boardSlugProblem, slugify, slugProblem } from "./slugs";
import { createAdminClient, serviceReady } from "./supabase/admin";
import { createClient } from "./supabase/server";
import { getAuth, readBoard } from "./workspace";

export type ActionResult = { ok: boolean; message: string } | null;

async function signedIn(next = "/home") {
  const auth = await getAuth();
  if (!auth) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { supabase: auth.supabase, user: auth };
}

const text = (form: FormData, key: string, max = 60) =>
  String(form.get(key) ?? "")
    .trim()
    .slice(0, max);

export async function slugTaken(slug: string) {
  const { supabase } = await signedIn();
  const { data } = await supabase.rpc("workspace_slug_taken", { p_slug: slug });
  return data === true;
}

export async function createWorkspace(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await signedIn("/new");
  const name = text(form, "name");
  const slug = text(form, "slug", 32);
  const boardName = text(form, "board") || "Product";
  if (!name) return { ok: false, message: "Give the workspace a name." };
  const problem = slugProblem(slug);
  if (problem) return { ok: false, message: `The address: ${problem.toLowerCase()}` };
  const boardSlug = slugify(boardName).replace(/-+$/, "") || "board";
  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: name,
    p_slug: slug,
    p_board_name: boardName,
    p_board_slug: boardSlugProblem(boardSlug) ? `${boardSlug}-board`.slice(0, 32) : boardSlug,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, message: "That address is taken. Try another." };
    return {
      ok: false,
      message: error.message.includes("20 workspaces") ? error.message : "That didn’t work. Try again.",
    };
  }
  const created = data as { workspace: string; board: string };
  redirect(`/${created.workspace}/${created.board}`);
}

async function freeBoardSlug(supabase: Awaited<ReturnType<typeof createClient>>, workspaceId: string, name: string) {
  const { data } = await supabase.from("boards").select("slug").eq("workspace_id", workspaceId);
  return boardSlugFor(name, (data ?? []).map((b) => b.slug as string));
}

export async function createBoard(_: ActionResult, form: FormData): Promise<ActionResult> {
  const workspace = text(form, "workspace", 64);
  const workspaceSlug = text(form, "workspaceSlug", 32);
  const { supabase } = await signedIn(`/${workspaceSlug}`);
  const name = text(form, "name");
  if (!name) return { ok: false, message: "Give the board a name." };
  const slug = await freeBoardSlug(supabase, workspace, name);
  const { error } = await supabase
    .from("boards")
    .insert({ workspace_id: workspace, slug, name, prefix: boardPrefixFor(name) });
  if (error) return { ok: false, message: "The board wasn’t created. Try again." };
  redirect(`/${workspaceSlug}/${slug}`);
}

export async function updateWorkspace(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await signedIn();
  const id = text(form, "workspace", 64);
  const name = text(form, "name");
  const slug = text(form, "slug", 32);
  const before = text(form, "before", 32);
  if (!name) return { ok: false, message: "A workspace needs a name." };
  const problem = slug === before ? null : slugProblem(slug);
  if (problem) return { ok: false, message: `The address: ${problem.toLowerCase()}` };
  const { data, error } = await supabase
    .from("workspaces")
    .update(slug === before ? { name } : { name, slug })
    .eq("id", id)
    .select("slug");
  if (error) return { ok: false, message: error.code === "23505" ? "That address is taken." : "That didn’t save." };
  if (!data?.length) return { ok: false, message: "Only owners and admins can change this." };
  if (slug !== before) redirect(`/${slug}/settings`);
  refresh();
  return { ok: true, message: "Saved." };
}

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function setWorkspaceLook(workspace: string, look: { sigil?: string; tone?: string }): Promise<ActionResult> {
  const patch: { sigil?: string; tone?: string } = {};
  if (look.sigil && sigils.includes(look.sigil as DitherName)) patch.sigil = look.sigil;
  if (look.tone && workspaceTones.includes(look.tone as Tone)) patch.tone = look.tone;
  if (!Object.keys(patch).length) return { ok: false, message: "That isn’t one of the choices." };
  const { supabase } = await signedIn();
  const { data, error } = await supabase.from("workspaces").update(patch).eq("id", workspace).select("id");
  if (error) return { ok: false, message: "That didn’t save." };
  if (!data?.length) return { ok: false, message: "Only owners and admins can change this." };
  refresh();
  return { ok: true, message: "Saved." };
}

// A picture of the workspace's own, or none to go back to its sigil. It's stored with the people's pictures,
// under workspaces/, and only the newest is kept
export async function setWorkspaceImage(form: FormData): Promise<ActionResult> {
  const id = text(form, "workspace", 64);
  if (!isUuid(id)) return { ok: false, message: "That workspace isn’t there." };
  const { supabase } = await signedIn();
  const { data: manager } = await supabase.rpc("is_manager", { ws: id });
  if (!manager) return { ok: false, message: "Only owners and admins can change this." };
  if (!serviceReady) return { ok: false, message: "Pictures aren’t available right now." };
  const bucket = createAdminClient().storage.from(avatarBucket);
  const folder = `workspaces/${id}`;
  let url: string | null = null;
  let path: string | undefined;

  if (form.get("source") === "upload") {
    const file = form.get("picture");
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a picture first." };
    if (file.size > maxAvatarBytes) return { ok: false, message: "That picture is too large." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = imageType(bytes);
    if (!type) return { ok: false, message: "Use a PNG, JPG or WebP image." };
    path = `${folder}/${Date.now()}.${type === "jpeg" ? "jpg" : type}`;
    const { error } = await bucket.upload(path, bytes, { contentType: `image/${type}`, cacheControl: "31536000" });
    if (error) return { ok: false, message: "That didn’t upload. Try again." };
    url = bucket.getPublicUrl(path).data.publicUrl;
  }

  const { data, error } = await supabase.from("workspaces").update({ image_url: url }).eq("id", id).select("id");
  if (error || !data?.length) {
    if (path) await bucket.remove([path]);
    if (error && noColumn(error.code))
      return { ok: false, message: "Pictures need the latest database update. Ask whoever runs Acta to apply it." };
    return { ok: false, message: "That didn’t save. Try again." };
  }
  const { data: files } = await bucket.list(folder, { limit: 100 });
  const old = (files ?? []).map((f) => `${folder}/${f.name}`).filter((p) => p !== path);
  if (old.length) await bucket.remove(old);
  refresh();
  return { ok: true, message: url ? "Picture updated." : "Picture removed." };
}

export async function deleteWorkspace(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await signedIn();
  const id = text(form, "workspace", 64);
  const { data, error } = await supabase.from("workspaces").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, message: "Only owners can delete a workspace." };
  (await cookies()).delete("acta-last");
  redirect("/home");
}

export async function leaveWorkspace(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await signedIn();
  const id = text(form, "workspace", 64);
  const { error } = await supabase.from("members").delete().eq("workspace_id", id).eq("user_id", user.id);
  if (error) return { ok: false, message: "That didn’t work. Try again." };
  (await cookies()).delete("acta-last");
  redirect("/home");
}

const roles: Role[] = ["owner", "admin", "member", "viewer"];
// Before the permissions migration there is no permissions column, and only the role can change
const noColumn = (code?: string) => code === "42703" || code === "PGRST204";

// A new role starts from that role's defaults, so permissions set for the old one don't carry over
export async function setRole(workspace: string, userId: string, role: Role): Promise<ActionResult> {
  if (!roles.includes(role)) return { ok: false, message: "That isn’t a role." };
  const { supabase } = await signedIn();
  const save = (patch: Record<string, unknown>) =>
    supabase.from("members").update(patch).eq("workspace_id", workspace).eq("user_id", userId).select("role");
  let { data, error } = await save({ role, permissions: {} });
  if (error && noColumn(error.code)) ({ data, error } = await save({ role }));
  if (error)
    return {
      ok: false,
      message: error.message.includes("owner") ? "A workspace needs an owner." : "That didn’t save.",
    };
  if (!data?.length) return { ok: false, message: "You can’t change that role." };
  refresh();
  return { ok: true, message: "Role changed." };
}

export async function setPermissions(
  workspace: string,
  userId: string,
  permissions: Permissions,
): Promise<ActionResult> {
  const known = new Set(permissionList.map((p) => p.id));
  const clean = Object.fromEntries(
    Object.entries(permissions).filter(([k, v]) => known.has(k as never) && typeof v === "boolean"),
  );
  const { supabase } = await signedIn();
  const { data, error } = await supabase
    .from("members")
    .update({ permissions: clean })
    .eq("workspace_id", workspace)
    .eq("user_id", userId)
    .select("user_id");
  if (error && noColumn(error.code))
    return { ok: false, message: "Permissions need the latest database update. Ask whoever runs Acta to apply it." };
  if (error) return { ok: false, message: "That didn’t save." };
  if (!data?.length) return { ok: false, message: "You can’t change what they can do." };
  refresh();
  return { ok: true, message: "Permissions saved." };
}

export async function removeMember(workspace: string, userId: string): Promise<ActionResult> {
  const { supabase } = await signedIn();
  const { data, error } = await supabase
    .from("members")
    .delete()
    .eq("workspace_id", workspace)
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data?.length) return { ok: false, message: "You can’t remove that person." };
  refresh();
  return { ok: true, message: "Removed from the workspace." };
}

export async function resetInviteLink(workspace: string): Promise<ActionResult> {
  const { supabase } = await signedIn();
  const { error } = await supabase.from("workspace_links").delete().eq("workspace_id", workspace);
  if (error) return { ok: false, message: "That didn’t work." };
  const { error: again } = await supabase.from("workspace_links").insert({ workspace_id: workspace });
  if (again) return { ok: false, message: "That didn’t work." };
  refresh();
  return { ok: true, message: "The old link no longer works." };
}

export async function joinWorkspace(_: ActionResult, form: FormData): Promise<ActionResult> {
  const token = text(form, "token", 128);
  const { supabase } = await signedIn(`/join/${token}`);
  const { data, error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error) return { ok: false, message: "This invite link no longer works. Ask for a new one." };
  redirect(`/${data as string}`);
}

export async function fetchBoardState(boardId: string) {
  const { supabase, user } = await signedIn();
  return readBoard(supabase, boardId, user.id);
}
