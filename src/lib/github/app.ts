import "server-only";
import { createSign } from "node:crypto";
import { serviceReady } from "@/lib/supabase/admin";

// The Acta GitHub App: who it is, and talking to GitHub as one of its installations. Without its settings the
// feature stays out of sight, the way agent keys do without a service key

const appId = process.env.GITHUB_APP_ID ?? "";
export const appSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? "";
// Hosts often keep a key's line breaks as \n
const privateKey = (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
export const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
const clientId = process.env.GITHUB_APP_CLIENT_ID ?? "";
const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET ?? "";

export const githubReady = Boolean(
  appId && appSlug && privateKey && webhookSecret && clientId && clientSecret && serviceReady,
);

/** How the app shows up on GitHub, so its own changes can be told apart */
export const botLogin = () => `${appSlug}[bot]`;

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const api = "https://api.github.com";
const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Acta" };

// A short-lived token proving the request comes from the app itself
function appJwt() {
  const now = Math.floor(Date.now() / 1000);
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iat: now - 60, exp: now + 540, iss: appId })}`;
  return `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(privateKey, "base64url")}`;
}

async function call<T>(path: string, auth: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${api}${path}`, {
    ...init,
    headers: { ...headers, Authorization: auth, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new GitHubError(res.status, `GitHub answered ${res.status} for ${path}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** A call as the app, for things about its installations */
export const asApp = <T>(path: string, init?: RequestInit) => call<T>(path, `Bearer ${appJwt()}`, init);

const tokens = new Map<number, { token: string; until: number }>();

async function installationToken(installation: number) {
  const cached = tokens.get(installation);
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const made = await asApp<{ token: string; expires_at: string }>(`/app/installations/${installation}/access_tokens`, {
    method: "POST",
  });
  tokens.set(installation, { token: made.token, until: Date.parse(made.expires_at) });
  return made.token;
}

/** A call as one installation, for its repositories */
export async function github<T>(installation: number, path: string, init?: RequestInit) {
  return call<T>(path, `Bearer ${await installationToken(installation)}`, init);
}

/** Every page of a list, up to a limit */
export async function githubAll<T>(installation: number, path: string, max = 300, pick?: (page: unknown) => T[]) {
  const out: T[] = [];
  for (let page = 1; out.length < max; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const data = await github<unknown>(installation, `${path}${sep}per_page=100&page=${page}`);
    const items = pick ? pick(data) : (data as T[]);
    out.push(...items);
    if (items.length < 100) break;
  }
  return out.slice(0, max);
}

/** The installations the person who signed in to GitHub can manage, from the code GitHub sent back */
export async function installationsFor(code: string): Promise<number[]> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    cache: "no-store",
  });
  const { access_token: token } = (await res.json()) as { access_token?: string };
  if (!token) return [];
  const found = await call<{ installations: { id: number }[] }>("/user/installations?per_page=100", `Bearer ${token}`);
  return found.installations.map((i) => i.id);
}

export const installUrl = (state: string) =>
  `https://github.com/apps/${appSlug}/installations/new?state=${encodeURIComponent(state)}`;
