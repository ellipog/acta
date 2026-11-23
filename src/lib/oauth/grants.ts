import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { after } from "next/server";
import { agentDb, forgetKey, forgetToken, keyHash, newKey, type Access } from "@/lib/agents/keys";
import type { KeyLimits } from "@/lib/agents/limits";
import { ClientProblem, clientUsed, findClient, type Client } from "./clients";
import { ourResource, scopes } from "./metadata";
import { backTo, redirectAllowed } from "./redirects";
import type { fetchPublic } from "./safe-fetch";

// The authorization code flow with PKCE (OAuth 2.1). The code a person's Allow makes is good once, for five minutes,
// for the client and redirect address it was made for, and only with the verifier behind its challenge. Trading it
// in makes an agent key with the access and workspaces the person chose, and that key is the access token. It lasts
// until it's revoked, like any key, and shows under Account → Agents

/** How many agents one person can have signed in at once */
export const connectionCap = 50;
const codeLife = 5 * 60_000;

export type AuthorizeQuery = Record<string, string | undefined>;

/** A sign-in request that holds up: who's asking, where to send them back, and what to ask the person */
export type AuthorizeRequest = {
  client: Client;
  redirectUri: string;
  state: string | undefined;
  challenge: string;
  /** The access to suggest, from the scopes the client asked for */
  access: Access;
};

/**
 * Checks a request to /oauth/authorize. When the client or its redirect address can't be trusted, the person is told
 * here (show) and never sent anywhere. Other problems go back to the client as an OAuth error (send)
 */
export async function checkAuthorize(
  query: AuthorizeQuery,
  issuer: string,
  fetcher?: typeof fetchPublic,
): Promise<AuthorizeRequest | { show: string } | { send: string }> {
  const id = query.client_id?.trim();
  if (!id) return { show: "The app didn’t say who it is. Start connecting again from the app." };
  let client: Client | null;
  try {
    client = await findClient(id, fetcher);
  } catch (error) {
    if (error instanceof ClientProblem) return { show: `The app couldn’t be checked. ${error.message}` };
    throw error;
  }
  if (!client) return { show: "Acta doesn’t know this app, or its sign-in has expired. Start connecting again from the app." };

  const asked = query.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
  if (!asked) return { show: "The app didn’t say where to send you back to. Start connecting again from the app." };
  if (!redirectAllowed(client.redirectUris, asked))
    return { show: `${client.name} asked to send you somewhere it didn’t register, so Acta stopped here.` };

  const state = query.state;
  const fail = (error: string, description: string) => ({
    send: backTo(asked, { error, error_description: description, state, iss: issuer }),
  });
  if (query.response_type !== "code") return fail("unsupported_response_type", "Acta only answers response_type=code.");
  const challenge = query.code_challenge ?? "";
  if (!challenge) return fail("invalid_request", "Acta needs PKCE: send a code_challenge.");
  if (query.code_challenge_method !== "S256") return fail("invalid_request", "Acta needs code_challenge_method=S256.");
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) return fail("invalid_request", "That code_challenge isn’t an S256 challenge.");
  if (query.resource && !ourResource(issuer, query.resource))
    return fail("invalid_target", "Tokens from Acta are only for Acta.");

  return { client, redirectUri: asked, state, challenge, access: suggestedAccess(query.scope) };
}

/** A client asking for one level gets that one suggested; anything else suggests read and write */
export function suggestedAccess(scope: string | undefined): Access {
  const asked = (scope ?? "").split(/\s+/).filter((s): s is Access => (scopes as readonly string[]).includes(s));
  return asked.length === 1 ? asked[0] : "write";
}

/** The address that sends the person back to the client with a code, once they've chosen what it may do */
export async function issueCode(request: AuthorizeRequest, userId: string, limits: KeyLimits, issuer: string) {
  const code = randomBytes(32).toString("base64url");
  const db = agentDb();
  const { error } = await db.from("oauth_codes").insert({
    hash: keyHash(code),
    client_id: request.client.id,
    client_name: request.client.name,
    user_id: userId,
    redirect_uri: request.redirectUri,
    challenge: request.challenge,
    name: limits.name,
    access: limits.access,
    workspaces: limits.workspaces,
    expires_at: new Date(Date.now() + codeLife).toISOString(),
  });
  if (error) throw new Error(error.message);
  // Codes go a day after they expire. Until then a used one can still be recognised if it comes back
  after(async () => {
    await db.from("oauth_codes").delete().lt("expires_at", new Date(Date.now() - 86_400_000).toISOString());
  });
  return backTo(request.redirectUri, { code, state: request.state, iss: issuer });
}

/** How many agents a person has signed in */
export async function connections(userId: string) {
  const { count } = await agentDb()
    .from("agent_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("client", "is", null);
  return count ?? 0;
}

export class GrantProblem extends Error {
  constructor(
    readonly code: "invalid_grant" | "invalid_request" | "invalid_client" | "invalid_target" | "access_denied",
    message: string,
  ) {
    super(message);
  }
}

const verifierShape = /^[A-Za-z0-9._~-]{43,128}$/;

/**
 * Trades a code for an access token. A code can be traded once: a second try revokes the key the first one made, in
 * case the code was stolen (OAuth 2.1, 4.1.3)
 */
export async function redeemCode(
  client: Client,
  params: { code?: string | null; verifier?: string | null; redirectUri?: string | null; resource?: string | null },
  issuer: string,
) {
  const { code, verifier, redirectUri, resource } = params;
  if (!code) throw new GrantProblem("invalid_request", "Send the code.");
  if (!verifier) throw new GrantProblem("invalid_request", "Send the code_verifier.");
  if (!verifierShape.test(verifier)) throw new GrantProblem("invalid_grant", "That code_verifier isn’t one.");
  if (resource && !ourResource(issuer, resource)) throw new GrantProblem("invalid_target", "Tokens from Acta are only for Acta.");

  const db = agentDb();
  const hash = keyHash(code);
  const now = new Date().toISOString();
  const { data: taken } = await db
    .from("oauth_codes")
    .update({ used_at: now })
    .eq("hash", hash)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("client_id, client_name, user_id, redirect_uri, challenge, name, access, workspaces");
  const grant = taken?.[0];
  if (!grant) {
    const { data: spent } = await db.from("oauth_codes").select("key_id, used_at").eq("hash", hash).maybeSingle();
    if (spent?.used_at && spent.key_id) {
      await db.from("agent_keys").delete().eq("id", spent.key_id);
      forgetKey(spent.key_id);
    }
    throw new GrantProblem("invalid_grant", spent?.used_at ? "That code was already used." : "That code doesn’t work, or it expired.");
  }
  if (grant.client_id !== client.id) throw new GrantProblem("invalid_grant", "That code was made for another client.");
  if (redirectUri && redirectUri !== grant.redirect_uri)
    throw new GrantProblem("invalid_grant", "That redirect_uri isn’t the one the code was made for.");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  if (challenge !== grant.challenge) throw new GrantProblem("invalid_grant", "The code_verifier doesn’t match the code_challenge.");
  if ((await connections(grant.user_id)) >= connectionCap)
    throw new GrantProblem("access_denied", `You have ${connectionCap} agents signed in. Disconnect one under Account → Agents first.`);

  const key = newKey();
  const { data: made, error } = await db
    .from("agent_keys")
    .insert({
      user_id: grant.user_id,
      name: grant.name,
      access: grant.access,
      workspaces: grant.workspaces,
      hash: key.hash,
      hint: key.hint,
      client: client.id,
      client_name: grant.client_name,
    })
    .select("id")
    .single();
  if (error || !made) throw new Error(error?.message ?? "The key wasn’t made.");
  await Promise.all([db.from("oauth_codes").update({ key_id: made.id }).eq("hash", hash), clientUsed(client)]);
  return { access_token: key.token, token_type: "Bearer", scope: grant.access as Access };
}

/** Revokes a token a client gives back (RFC 7009). Only keys made by signing in, and only the client's own */
export async function revokeToken(client: Client | null, token: string) {
  let query = agentDb().from("agent_keys").delete().eq("hash", keyHash(token)).not("client", "is", null);
  if (client) query = query.eq("client", client.id);
  await query;
  forgetToken(token);
}
