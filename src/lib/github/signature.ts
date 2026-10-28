import { createHmac, timingSafeEqual } from "node:crypto";

// Signing that needs no GitHub: checking a webhook came from GitHub, and the install link's state, which ties an
// installation coming back from GitHub to the workspace and person who started it

const hmac = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("hex");

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Whether a webhook's X-Hub-Signature-256 matches its body */
export function signatureOk(secret: string, body: string, header: string | null) {
  if (!secret || !header?.startsWith("sha256=")) return false;
  return same(header, `sha256=${hmac(secret, body)}`);
}

export type InstallState = { workspace: string; user: string; exp: number };

export function signState(secret: string, state: Omit<InstallState, "exp">, ttl = 30 * 60_000) {
  const body = Buffer.from(JSON.stringify({ ...state, exp: Date.now() + ttl })).toString("base64url");
  return `${body}.${hmac(secret, body)}`;
}

/** The state from an install link, if it's ours and hasn't expired */
export function readState(secret: string, value: string | null): InstallState | null {
  if (!secret || !value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig || !same(sig, hmac(secret, body))) return null;
  try {
    const state = JSON.parse(Buffer.from(body, "base64url").toString()) as InstallState;
    return typeof state.workspace === "string" && typeof state.user === "string" && state.exp > Date.now()
      ? state
      : null;
  } catch {
    return null;
  }
}
