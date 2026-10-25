import "server-only";
import { cache } from "react";
import { providerPictures, type ProviderPicture } from "./avatars";
import { authReady } from "./supabase/env";
import { createClient } from "./supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  pictures: ProviderPicture[];
  methods: string[];
  joined: string;
  admin: boolean;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!authReady) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const [{ data: profile }, { data: admin }] = await Promise.all([
    supabase.from("profiles").select("name, avatar_url").eq("id", user.id).maybeSingle(),
    supabase.rpc("is_admin"),
  ]);

  return {
    id: user.id,
    email: user.email ?? "",
    name: profile?.name || user.email?.split("@")[0] || "You",
    avatar: profile?.avatar_url ?? null,
    pictures: providerPictures(user.identities),
    methods: [...new Set((user.identities ?? []).map((i) => i.provider))],
    joined: user.created_at,
    admin: admin === true,
  };
});
