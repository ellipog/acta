import type { UserIdentity } from "@supabase/supabase-js";

export const avatarBucket = "avatars";
export const avatarSide = 256;
export const maxAvatarBytes = 512 * 1024;

/** What an uploaded picture really is, from its first bytes rather than what it claims */
export function imageType(b: Uint8Array) {
  const text = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0x89 && text(1, 4) === "PNG") return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "webp";
  return null;
}

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
