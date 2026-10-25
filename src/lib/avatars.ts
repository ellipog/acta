import type { UserIdentity } from "@supabase/supabase-js";

export const avatarBucket = "avatars";
export const avatarSide = 256;
export const maxAvatarBytes = 512 * 1024;

const trustedHosts = new Set(["avatars.githubusercontent.com", "lh3.googleusercontent.com"]);

export type ProviderPicture = { provider: string; url: string };

export function providerPictures(identities: UserIdentity[] = []): ProviderPicture[] {
  const found = new Map<string, string>();
  for (const i of identities) {
    const url = i.identity_data?.avatar_url ?? i.identity_data?.picture;
    if (typeof url !== "string" || found.has(i.provider)) continue;
    try {
      const u = new URL(url);
      if (u.protocol === "https:" && trustedHosts.has(u.hostname)) found.set(i.provider, url);
    } catch {
      continue;
    }
  }
  return [...found].map(([provider, url]) => ({ provider, url }));
}
