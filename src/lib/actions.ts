"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "./live";
import { boardPrefixFor, boardSlugFor, boardSlugProblem, slugify, slugProblem } from "./slugs";
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

export async function setRole(workspace: string, userId: string, role: Role): Promise<ActionResult> {
  const { supabase } = await signedIn();
  const { data, error } = await supabase
    .from("members")
    .update({ role })
    .eq("workspace_id", workspace)
    .eq("user_id", userId)
    .select("role");
  if (error)
    return {
      ok: false,
      message: error.message.includes("owner") ? "A workspace needs an owner." : "That didn’t save.",
    };
  if (!data?.length) return { ok: false, message: "You can’t change that role." };
  refresh();
  return { ok: true, message: "Role changed." };
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
