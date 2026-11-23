import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { agentDb, keyHash } from "@/lib/agents/keys";
import { redirectProblem } from "./redirects";
import { fetchPublic } from "./safe-fetch";

// The apps that sign in. There are two kinds, and Acta takes both, as the MCP authorization spec asks:
// - A client id that is an https address names a client metadata document the client publishes. Acta reads it when
//   the client asks to sign in and trusts the redirect addresses in it. Nothing is stored
// - Any other client id was handed out by dynamic client registration (RFC 7591) and is looked up in oauth_clients

export type Client = {
  id: string;
  name: string;
  redirectUris: string[];
  /** Hash of the client's secret, for the few clients that registered with one */
  secretHash: string | null;
  /** True when the client id is the address of its metadata document, so its name comes from a domain it controls */
  document: boolean;
};

export class ClientProblem extends Error {}

/** A name fit to show and to mark an agent's work with: printable, one line, not too long */
export function cleanName(name: unknown, fallback: string) {
  const clean =
    typeof name === "string"
      ? name
          .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 100)
          .trim()
      : "";
  return clean || fallback;
}

const isDocumentId = (id: string) => id.startsWith("https://");

// Client documents read lately, so a client signing in doesn't fetch its document again for the token request
const documents = new Map<string, { client: Client; until: number }>();
const documentCap = 200;

/** Whether an https address can be a client id: it has a path, and no fragment, user name, password or dot segments */
export function documentIdProblem(id: string) {
  let url: URL;
  try {
    url = new URL(id);
  } catch {
    return "The client id isn’t a URL.";
  }
  if (url.protocol !== "https:" || url.hash || url.username || url.password) return "The client id isn’t a usable https URL.";
  if (url.pathname === "/" || /\/\.\.?(\/|$)/.test(id.slice(url.origin.length)))
    return "The client id has to name a document, with a path.";
  return null;
}

/** Turns a client metadata document into a client, or says what's wrong with it */
export function clientFromDocument(id: string, body: unknown): Client {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ClientProblem("Its metadata document isn’t a JSON object.");
  const doc = body as Record<string, unknown>;
  if (doc.client_id !== id) throw new ClientProblem("Its metadata document names a different client id.");
  const method = doc.token_endpoint_auth_method ?? "none";
  if (method !== "none") throw new ClientProblem("It wants to sign in with a key Acta doesn’t take. Only public clients are supported.");
  const uris = doc.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10) throw new ClientProblem("Its metadata document lists no redirect addresses.");
  for (const uri of uris) {
    const problem = redirectProblem(uri);
    if (problem) throw new ClientProblem(problem);
  }
  return {
    id,
    name: cleanName(doc.client_name, new URL(id).host),
    redirectUris: uris as string[],
    secretHash: null,
    document: true,
  };
}

async function documentClient(id: string, fetcher: typeof fetchPublic): Promise<Client> {
  const now = Date.now();
  const cached = documents.get(id);
  if (cached && cached.until > now) return cached.client;
  const problem = documentIdProblem(id);
  if (problem) throw new ClientProblem(problem);
  let body: unknown;
  let maxAge: number | null;
  try {
    const got = await fetcher(id);
    maxAge = got.maxAge;
    body = JSON.parse(got.text);
  } catch (error) {
    throw new ClientProblem(
      error instanceof SyntaxError
        ? "Its metadata document isn’t JSON."
        : `Its metadata document couldn’t be read from ${new URL(id).host}. ${(error as Error).message}`.trim(),
    );
  }
  const client = clientFromDocument(id, body);
  // Kept as long as the document asks, between a minute and an hour, ten minutes when it doesn't say
  const keep = Math.min(Math.max(maxAge ?? 600, 60), 3600) * 1000;
  documents.delete(id);
  if (documents.size >= documentCap) documents.delete(documents.keys().next().value!);
  documents.set(id, { client, until: now + keep });
  return client;
}

/**
 * The client with this id, or null when Acta doesn't know it. Throws ClientProblem, with what to tell the person,
 * when the client's metadata document can't be read or doesn't hold up
 */
export async function findClient(id: string, fetcher: typeof fetchPublic = fetchPublic): Promise<Client | null> {
  if (!id || id.length > 2048) return null;
  if (isDocumentId(id)) return documentClient(id, fetcher);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) return null;
  const { data } = await agentDb()
    .from("oauth_clients")
    .select("id, name, redirect_uris, secret_hash")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, name: data.name, redirectUris: data.redirect_uris, secretHash: data.secret_hash, document: false };
}

/** Whether a secret a client sent is its own. Clients without a secret need none */
export function secretMatches(client: Client, secret: string | null) {
  if (!client.secretHash) return true;
  if (!secret) return false;
  return timingSafeEqual(Buffer.from(keyHash(secret), "hex"), Buffer.from(client.secretHash, "hex"));
}

/** Marks a registered client as used, so it isn't cleared away with registrations nobody finished */
export async function clientUsed(client: Client) {
  if (client.document) return;
  await agentDb().from("oauth_clients").update({ used_at: new Date().toISOString() }).eq("id", client.id);
}

const authMethods = ["none", "client_secret_post", "client_secret_basic"];

export class RegistrationProblem extends Error {
  constructor(
    message: string,
    readonly code: "invalid_redirect_uri" | "invalid_client_metadata" = "invalid_client_metadata",
  ) {
    super(message);
  }
}

/**
 * Dynamic client registration (RFC 7591). Takes the client's metadata and answers with its new client id, and a
 * secret only when the client asked to authenticate with one
 */
export async function registerClient(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RegistrationProblem("Send the client’s metadata as a JSON object.");
  const meta = body as Record<string, unknown>;
  const uris = meta.redirect_uris;
  if (!Array.isArray(uris) || !uris.length) throw new RegistrationProblem("List at least one redirect address in redirect_uris.", "invalid_redirect_uri");
  if (uris.length > 10) throw new RegistrationProblem("List at most 10 redirect addresses.", "invalid_redirect_uri");
  for (const uri of uris) {
    const problem = redirectProblem(uri);
    if (problem) throw new RegistrationProblem(problem, "invalid_redirect_uri");
  }
  const method = (meta.token_endpoint_auth_method as string | undefined) ?? "none";
  if (!authMethods.includes(method))
    throw new RegistrationProblem(`token_endpoint_auth_method must be one of ${authMethods.join(", ")}.`);
  const grants = Array.isArray(meta.grant_types) ? (meta.grant_types as unknown[]) : ["authorization_code"];
  if (!grants.includes("authorization_code")) throw new RegistrationProblem("Acta only gives tokens for the authorization_code grant.");
  const types = Array.isArray(meta.response_types) ? (meta.response_types as unknown[]) : ["code"];
  if (!types.includes("code")) throw new RegistrationProblem("Acta only answers response_type code.");

  const id = randomBytes(18).toString("base64url");
  const secret = method === "none" ? null : `acta_secret_${randomBytes(24).toString("base64url")}`;
  const host = (() => {
    try {
      return new URL(uris[0] as string).host;
    } catch {
      return "";
    }
  })();
  const name = cleanName(meta.client_name, host && !/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) ? host : "MCP client");
  const uri = typeof meta.client_uri === "string" && /^https:\/\//.test(meta.client_uri) ? meta.client_uri.slice(0, 2048) : null;

  const db = agentDb();
  const { error } = await db.from("oauth_clients").insert({
    id,
    name,
    redirect_uris: uris,
    secret_hash: secret ? keyHash(secret) : null,
    uri,
  });
  if (error) throw new Error(error.message);

  // Registrations nobody signed in with within a day go
  after(async () => {
    await db
      .from("oauth_clients")
      .delete()
      .is("used_at", null)
      .lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
  });

  return {
    client_id: id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_name: name,
    redirect_uris: uris,
    token_endpoint_auth_method: method,
    grant_types: ["authorization_code"],
    response_types: ["code"],
    ...(uri ? { client_uri: uri } : {}),
    ...(typeof meta.scope === "string" ? { scope: meta.scope } : {}),
  };
}
