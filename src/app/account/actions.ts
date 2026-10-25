"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { avatarBucket, maxAvatarBytes, providerPictures } from "@/lib/avatars";
import { createAdminClient, serviceReady } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type Result = { ok: boolean; message: string } | null;

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

function imageType(b: Uint8Array) {
  const text = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0x89 && text(1, 4) === "PNG") return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "webp";
  return null;
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
