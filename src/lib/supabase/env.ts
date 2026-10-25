export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const authReady = Boolean(supabaseUrl && supabaseKey);

export type Provider = "email" | "google" | "github";

export const providers = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "email")
  .split(",")
  .map((p) => p.trim())
  .filter((p): p is Provider => p === "email" || p === "google" || p === "github");

export function safeNext(next: string | null | undefined, fallback = "/home") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
