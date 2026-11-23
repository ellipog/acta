import type { AuthorizeQuery } from "@/lib/oauth/grants";

const names = [
  "response_type",
  "client_id",
  "redirect_uri",
  "state",
  "scope",
  "code_challenge",
  "code_challenge_method",
  "resource",
] as const;

/**
 * The parameters of a sign-in request that Acta reads, each once. Null when one is repeated, which OAuth doesn't
 * allow, or isn't text
 */
export function authorizeQuery(raw: Record<string, unknown>): AuthorizeQuery | null {
  const out: AuthorizeQuery = {};
  for (const name of names) {
    const value = raw[name];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || value.length > 4096) return null;
    out[name] = value;
  }
  return out;
}
