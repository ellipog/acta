"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { newKey, type Access } from "@/lib/agents/keys";
import { avatarBucket, imageType, maxAvatarBytes, providerPictures } from "@/lib/avatars";
import { createAdminClient, serviceReady } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type Result = { ok: boolean; message: string } | null;
export type KeyResult = { ok: boolean; message: string; token?: string } | null;

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/account");
  return { supabase, user: data.user };
}

export async function rename(_: Result, form: FormData): Promise<Result> {
  const { supabase, user } = await requireUser();
  const name = String(form.get("name") ?? "")
    .trim()
    .slice(0, 80);
  if (!name) return { ok: false, message: "A name can’t be empty." };
  const { error } = await supabase.from("profiles").update({ name }).eq("id", user.id);
  if (error) return { ok: false, message: "That didn’t save. Try again." };
  refresh();
  return { ok: true, message: "Saved." };
}

async function clearPictures(id: string, keep?: string) {
  const bucket = createAdminClient().storage.from(avatarBucket);
  const { data } = await bucket.list(id, { limit: 100 });
  const old = (data ?? []).map((f) => `${id}/${f.name}`).filter((p) => p !== keep);
  if (old.length) await bucket.remove(old);
}

export async function changePicture(_: Result, form: FormData): Promise<Result> {
  const { user } = await requireUser();
  if (!serviceReady) return { ok: false, message: "Pictures aren’t available right now." };
  const admin = createAdminClient();
  const source = String(form.get("source") ?? "");
  let url: string | null = null;
  let path: string | undefined;

  if (source === "upload") {
    const file = form.get("picture");
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a picture first." };
    if (file.size > maxAvatarBytes) return { ok: false, message: "That picture is too large." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = imageType(bytes);
    if (!type) return { ok: false, message: "Use a PNG, JPG or WebP image." };
    path = `${user.id}/${Date.now()}.${type === "jpeg" ? "jpg" : type}`;
    const bucket = admin.storage.from(avatarBucket);
    const { error } = await bucket.upload(path, bytes, { contentType: `image/${type}`, cacheControl: "31536000" });
    if (error) return { ok: false, message: "That didn’t upload. Try again." };
    url = bucket.getPublicUrl(path).data.publicUrl;
  } else if (source !== "none") {
    const found = providerPictures(user.identities).find((p) => p.provider === source);
    if (!found) return { ok: false, message: "That picture isn’t available." };
    url = found.url;
  }

  const { error } = await admin.from("profiles").update({ avatar_url: url }).eq("id", user.id);
  if (error) {
    if (path) await admin.storage.from(avatarBucket).remove([path]);
    return { ok: false, message: "That didn’t save. Try again." };
  }
  await clearPictures(user.id, path);
  refresh();
  return { ok: true, message: url ? "Picture updated." : "Picture removed." };
}

export async function deleteAccount(_: Result, form: FormData): Promise<Result> {
  const { supabase, user } = await requireUser();
  const typed = String(form.get("confirm") ?? "")
    .trim()
    .toLowerCase();
  if (!user.email || typed !== user.email.toLowerCase())
    return { ok: false, message: "Type your email exactly to confirm." };
  if (!serviceReady) return { ok: false, message: "Deleting isn’t available right now. Write to us and we’ll do it." };
  await clearPictures(user.id);
  await supabase.auth.signOut();
  const { error } = await createAdminClient().auth.admin.deleteUser(user.id);
  if (error) return { ok: false, message: "We couldn’t delete the account. Try again, or write to us." };
  redirect("/?account=deleted");
}

const levels: Access[] = ["read", "write", "manage"];
const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export type KeyLimits = { name: string; access: Access; workspaces: string[] | null };

// A key's name, what it can do and where, checked the same way when it's made and when it's changed
function keyLimits(name: unknown, access: unknown, some: boolean, workspaces: unknown[]): KeyLimits | string {
  const clean = String(name ?? "")
    .trim()
    .slice(0, 40);
  const picked = [...new Set(workspaces.map(String).filter(isUuid))].slice(0, 50);
  if (!clean) return "Name the key after the agent that will use it.";
  if (!levels.includes(access as Access)) return "Choose what the key can do.";
  if (some && !picked.length) return "Choose at least one workspace.";
  return { name: clean, access: access as Access, workspaces: some ? picked : null };
}

// The key is shown once. Only its hash is stored
export async function createAgentKey(_: KeyResult, form: FormData): Promise<KeyResult> {
  const { supabase } = await requireUser();
  const limits = keyLimits(form.get("name"), form.get("access"), form.get("reach") === "some", form.getAll("workspace"));
  if (typeof limits === "string") return { ok: false, message: limits };
  const { count } = await supabase.from("agent_keys").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= 25) return { ok: false, message: "You can have 25 keys. Revoke one you don’t use first." };
  const key = newKey();
  const { error } = await supabase.from("agent_keys").insert({ ...limits, hash: key.hash, hint: key.hint });
  if (error) return { ok: false, message: "The key wasn’t made. Try again." };
  refresh();
  return { ok: true, message: "Key made.", token: key.token };
}

// The key itself stays the same, so agents using it carry on with what it may do now
export async function updateAgentKey(id: string, change: KeyLimits): Promise<Result> {
  const { supabase } = await requireUser();
  if (!isUuid(String(id))) return { ok: false, message: "That key wasn’t found." };
  const limits = keyLimits(
    change?.name,
    change?.access,
    Array.isArray(change?.workspaces),
    Array.isArray(change?.workspaces) ? change.workspaces : [],
  );
  if (typeof limits === "string") return { ok: false, message: limits };
  const { data, error } = await supabase.from("agent_keys").update(limits).eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, message: "That didn’t save. Try again." };
  refresh();
  return { ok: true, message: `${limits.name} saved.` };
}

export async function revokeAgentKey(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("agent_keys").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, message: "That key wasn’t revoked. Try again." };
  refresh();
  return { ok: true, message: "Revoked. Agents using it lost access straight away." };
}
