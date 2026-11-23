import { beforeEach, expect, mock, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeSupabase as db } from "./fake-supabase";
import { me, seed } from "./agent-world";

// MCP clients that sign in: discovery, registration, the code flow with PKCE, a code that comes back twice, clients
// that publish a metadata document, and that what a client ends up with is an ordinary agent key

const afters: (() => unknown)[] = [];
const real = await import("next/server");
mock.module("next/server", () => ({ ...real, after: (fn: () => unknown) => void afters.push(fn) }));
mock.module("server-only", () => ({}));
mock.module("@/lib/supabase/admin", () => ({ createAdminClient: () => db, serviceReady: true }));

const { agentFor, verifyKey } = await import("@/lib/agents/keys");
const { checkAuthorize, issueCode, suggestedAccess } = await import("@/lib/oauth/grants");
const { findClient, clientFromDocument, documentIdProblem } = await import("@/lib/oauth/clients");
const { redirectAllowed, redirectProblem, redirectPlace } = await import("@/lib/oauth/redirects");
const { privateAddress } = await import("@/lib/oauth/safe-fetch");
const { resourceMetadataUrl } = await import("@/lib/oauth/metadata");
const { authorizeQuery } = await import("@/app/oauth/authorize/query");
const register = (await import("@/app/api/oauth/register/route")).POST;
const token = (await import("@/app/api/oauth/token/route")).POST;
const revoke = (await import("@/app/api/oauth/revoke/route")).POST;
const resourceDoc = (await import("@/app/.well-known/oauth-protected-resource/[[...path]]/route")).GET;
const serverDoc = (await import("@/app/.well-known/oauth-authorization-server/[[...path]]/route")).GET;

const origin = "https://acta.test";
const at = (path: string, init: RequestInit = {}) =>
  new Request(`http://localhost:4660${path}`, {
    ...init,
    headers: { host: "acta.test", "x-forwarded-proto": "https", ...(init.headers as Record<string, string>) },
  });
const form = (path: string, fields: Record<string, string>, headers: Record<string, string> = {}) =>
  at(path, {
    method: "POST",
    body: new URLSearchParams(fields).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
  });

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

beforeEach(() => {
  seed(db);
  db.tables.oauth_clients = [];
  db.tables.oauth_codes = [];
  afters.length = 0;
});

async function registered(meta: Record<string, unknown> = {}) {
  const response = await register(
    at("/api/oauth/register", {
      method: "POST",
      body: JSON.stringify({ client_name: "Claude Code", redirect_uris: ["http://localhost/callback"], ...meta }),
      headers: { "content-type": "application/json" },
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, string> };
}

// Signs in as far as the code, as the consent page does when the person presses Allow
async function codeFor(clientId: string, challenge: string, choice = { name: "Claude Code", access: "read" as const, workspaces: null }) {
  const request = await checkAuthorize(
    {
      response_type: "code",
      client_id: clientId,
      redirect_uri: "http://localhost:51234/callback",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "st4te",
      scope: "read write manage",
      resource: `${origin}/api/mcp`,
    },
    origin,
  );
  if (!("client" in request)) throw new Error(JSON.stringify(request));
  const back = new URL(await issueCode(request, me, choice, origin));
  return { back, code: back.searchParams.get("code")! };
}

test("a request without a key is pointed to where it can sign in", async () => {
  const refused = await agentFor(at("/api/mcp", { method: "POST" }), resourceMetadataUrl(origin, "/api/mcp"));
  expect(refused).toBeInstanceOf(Response);
  const challenge = (refused as Response).headers.get("www-authenticate")!;
  expect(challenge).toContain(`resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`);
  expect(challenge).not.toContain("error=");

  const wrong = await agentFor(
    at("/api/mcp", { method: "POST", headers: { authorization: `Bearer acta_${"x".repeat(32)}` } }),
    resourceMetadataUrl(origin, "/api/mcp"),
  );
  expect((wrong as Response).headers.get("www-authenticate")).toContain('error="invalid_token"');
});

test("the discovery documents name Acta's endpoints on the address the request came in on", async () => {
  const resource = await resourceDoc(at("/.well-known/oauth-protected-resource/api/mcp"), {
    params: Promise.resolve({ path: ["api", "mcp"] }),
  });
  expect(await resource.json()).toMatchObject({ resource: `${origin}/api/mcp`, authorization_servers: [origin] });
  const root = await resourceDoc(at("/.well-known/oauth-protected-resource"), { params: Promise.resolve({ path: undefined }) });
  expect((await root.json()).resource).toBe(origin);
  const nowhere = await resourceDoc(at("/.well-known/oauth-protected-resource/elsewhere"), {
    params: Promise.resolve({ path: ["elsewhere"] }),
  });
  expect(nowhere.status).toBe(404);

  const server = await (await serverDoc(at("/.well-known/oauth-authorization-server"))).json();
  expect(server).toMatchObject({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
  });
});

test("an agent signs in, gets an ordinary key with what the person chose, and the code works once", async () => {
  const { status, body: client } = await registered();
  expect(status).toBe(201);
  expect(client.client_secret).toBeUndefined();
  const { verifier, challenge } = pkce();
  const { back, code } = await codeFor(client.client_id, challenge);
  expect(back.origin + back.pathname).toBe("http://localhost:51234/callback");
  expect(back.searchParams.get("state")).toBe("st4te");
  expect(back.searchParams.get("iss")).toBe(origin);

  const trade = () =>
    token(
      form("/api/oauth/token", {
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: client.client_id,
        redirect_uri: "http://localhost:51234/callback",
        resource: `${origin}/api/mcp`,
      }),
    );
  const first = await trade();
  expect(first.status).toBe(200);
  expect(first.headers.get("cache-control")).toBe("no-store");
  const tokens = await first.json();
  expect(tokens).toMatchObject({ token_type: "Bearer", scope: "read" });
  expect(tokens.expires_in).toBeUndefined();

  const agent = await verifyKey(tokens.access_token);
  expect(agent).toMatchObject({ userId: me, name: "Claude Code", access: "read", workspaces: null });
  const row = db.rows("agent_keys").find((k) => k.id === agent!.keyId)!;
  expect(row).toMatchObject({ client: client.client_id, client_name: "Claude Code" });
  expect(db.rows("oauth_clients")[0].used_at).not.toBeNull();

  // The same code again looks stolen, so the key it made goes too
  const second = await trade();
  expect(second.status).toBe(400);
  expect((await second.json()).error).toBe("invalid_grant");
  expect(db.rows("agent_keys").some((k) => k.id === agent!.keyId)).toBe(false);
  expect(await verifyKey(tokens.access_token)).toBeNull();
});

test("a code needs its own verifier, client and redirect address, and goes stale", async () => {
  const { body: client } = await registered();
  const { body: other } = await registered({ client_name: "Other" });
  const { verifier, challenge } = pkce();
  const trade = async (fields: Record<string, string>) => {
    const { code } = await codeFor(client.client_id, challenge);
    const response = await token(
      form("/api/oauth/token", { grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id, ...fields }),
    );
    return { status: response.status, ...(await response.json()) };
  };
  expect(await trade({ code_verifier: pkce().verifier })).toMatchObject({ status: 400, error: "invalid_grant" });
  expect(await trade({ client_id: other.client_id })).toMatchObject({ status: 400, error: "invalid_grant" });
  expect(await trade({ redirect_uri: "http://localhost:51234/other" })).toMatchObject({ status: 400, error: "invalid_grant" });
  expect(await trade({ resource: "https://elsewhere.test/mcp" })).toMatchObject({ status: 400, error: "invalid_target" });
  expect(await trade({ client_id: "nobody-0000000000000" })).toMatchObject({ status: 401, error: "invalid_client" });
  expect(db.rows("agent_keys").filter((k) => k.client)).toHaveLength(0);

  const { code } = await codeFor(client.client_id, challenge);
  for (const c of db.rows("oauth_codes")) c.expires_at = new Date(Date.now() - 1000).toISOString();
  const stale = await token(
    form("/api/oauth/token", { grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id }),
  );
  expect((await stale.json()).error).toBe("invalid_grant");

  const refresh = await token(form("/api/oauth/token", { grant_type: "refresh_token", refresh_token: "x" }));
  expect((await refresh.json()).error).toBe("unsupported_grant_type");
});

test("a client that registered with a secret has to send it, in the body or by HTTP Basic", async () => {
  const { body: client } = await registered({ token_endpoint_auth_method: "client_secret_basic" });
  expect(client.client_secret).toMatch(/^acta_secret_/);
  const { verifier, challenge } = pkce();
  const send = async (headers: Record<string, string>, extra: Record<string, string> = {}) => {
    const { code } = await codeFor(client.client_id, challenge);
    return (await token(form("/api/oauth/token", { grant_type: "authorization_code", code, code_verifier: verifier, ...extra }, headers)))
      .status;
  };
  expect(await send({}, { client_id: client.client_id })).toBe(401);
  expect(await send({}, { client_id: client.client_id, client_secret: "acta_secret_wrong" })).toBe(401);
  const basic = Buffer.from(`${client.client_id}:${encodeURIComponent(client.client_secret)}`).toString("base64");
  expect(await send({ authorization: `Basic ${basic}` })).toBe(200);
  expect(await send({}, { client_id: client.client_id, client_secret: client.client_secret })).toBe(200);
});

test("registration only takes addresses a code can safely be sent to", async () => {
  for (const uri of ["http://evil.test/callback", "javascript:alert(1)", "https://app.test/cb#frag", "data:text/html,x"])
    expect((await registered({ redirect_uris: [uri] })).body.error).toBe("invalid_redirect_uri");
  expect((await registered({ redirect_uris: [] })).status).toBe(400);
  expect((await registered({ grant_types: ["client_credentials"] })).status).toBe(400);
  for (const uri of ["https://claude.ai/api/mcp/auth_callback", "http://127.0.0.1:33418/", "cursor://anysphere.cursor-retrieval/oauth/callback"])
    expect((await registered({ redirect_uris: [uri] })).status).toBe(201);
  // A name that would be strange to show or mark work with is cleaned up
  expect((await registered({ client_name: "  Evil‮\n  App  " })).body.client_name).toBe("Evil App");
  expect((await registered({ client_name: undefined, redirect_uris: ["https://app.test/cb"] })).body.client_name).toBe("app.test");
});

test("a client is only sent back to an address it registered, though a local one may pick its port", async () => {
  const registeredUris = ["http://localhost/callback", "https://app.test/cb"];
  expect(redirectAllowed(registeredUris, "http://localhost:9999/callback")).toBe(true);
  expect(redirectAllowed(registeredUris, "http://localhost:9999/other")).toBe(false);
  expect(redirectAllowed(registeredUris, "http://127.0.0.1:9999/callback")).toBe(false);
  expect(redirectAllowed(registeredUris, "https://app.test/cb")).toBe(true);
  expect(redirectAllowed(registeredUris, "https://app.test:444/cb")).toBe(false);
  expect(redirectAllowed(registeredUris, "https://app.test/cb?x=1")).toBe(false);
  expect(redirectProblem("http://localhost.evil.test/cb")).not.toBeNull();
  expect(redirectPlace("http://127.0.0.1:5000/cb")).toBe("an app on this computer");
  expect(redirectPlace("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai");
  expect(redirectPlace("vscode://vscode.github-authentication/did-authenticate")).toBe("vscode://vscode.github-authentication");
});

test("a bad client or redirect address stops on Acta's page; other problems go back to the client", async () => {
  const { body: client } = await registered();
  const { challenge } = pkce();
  const base = {
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: "http://localhost:5000/callback",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "s",
  };
  expect(await checkAuthorize({ ...base, client_id: "unknown-client-000000" }, origin)).toHaveProperty("show");
  expect(await checkAuthorize({ ...base, redirect_uri: "https://evil.test/cb" }, origin)).toHaveProperty("show");
  const noPkce = await checkAuthorize({ ...base, code_challenge: undefined }, origin);
  expect("send" in noPkce && new URL(noPkce.send).searchParams.get("error")).toBe("invalid_request");
  const plain = await checkAuthorize({ ...base, code_challenge_method: "plain" }, origin);
  expect("send" in plain && new URL(plain.send).searchParams.get("state")).toBe("s");
  const implicit = await checkAuthorize({ ...base, response_type: "token" }, origin);
  expect("send" in implicit && new URL(implicit.send).searchParams.get("error")).toBe("unsupported_response_type");
  // With one address registered, a client may leave it out
  expect(await checkAuthorize({ ...base, redirect_uri: undefined }, origin)).toHaveProperty("redirectUri", "http://localhost/callback");

  expect(suggestedAccess("read")).toBe("read");
  expect(suggestedAccess("read write manage")).toBe("write");
  expect(suggestedAccess(undefined)).toBe("write");
  expect(authorizeQuery({ client_id: ["a", "b"] })).toBeNull();
  expect(authorizeQuery({ client_id: "a", other: "x" })).toEqual({ client_id: "a" });
});

test("a client named by its metadata document is read from there, and has to match it", async () => {
  const id = "https://app.test/oauth/client.json";
  const doc = { client_id: id, client_name: "Doc Client", redirect_uris: ["http://127.0.0.1/callback"], token_endpoint_auth_method: "none" };
  let fetches = 0;
  const fetcher = async () => {
    fetches++;
    return { text: JSON.stringify(doc), type: "application/json", maxAge: null };
  };
  const client = await findClient(id, fetcher);
  expect(client).toMatchObject({ id, name: "Doc Client", document: true, secretHash: null });
  await findClient(id, fetcher);
  expect(fetches).toBe(1);

  const { verifier, challenge } = pkce();
  const request = await checkAuthorize(
    { response_type: "code", client_id: id, redirect_uri: "http://127.0.0.1:7777/callback", code_challenge: challenge, code_challenge_method: "S256" },
    origin,
    fetcher,
  );
  expect(request).toHaveProperty("client");
  const back = new URL(await issueCode(request as Parameters<typeof issueCode>[0], me, { name: "Doc Client", access: "write", workspaces: null }, origin));
  const response = await token(
    form("/api/oauth/token", { grant_type: "authorization_code", code: back.searchParams.get("code")!, code_verifier: verifier, client_id: id }),
  );
  expect(response.status).toBe(200);
  expect(db.rows("agent_keys").find((k) => k.client === id)).toMatchObject({ client_name: "Doc Client", access: "write" });

  expect(() => clientFromDocument(id, { ...doc, client_id: "https://app.test/other.json" })).toThrow("different client id");
  expect(() => clientFromDocument(id, { ...doc, token_endpoint_auth_method: "client_secret_basic" })).toThrow();
  expect(() => clientFromDocument(id, { ...doc, redirect_uris: ["http://evil.test/cb"] })).toThrow();
  expect(documentIdProblem("https://app.test/")).not.toBeNull();
  expect(documentIdProblem("https://app.test/a/../b.json")).not.toBeNull();
  const broken = await checkAuthorize({ client_id: "https://broken.test/client.json" }, origin, async () => {
    throw new Error("It answered 404.");
  });
  expect(broken).toHaveProperty("show");
});

test("client documents can't be fetched from anywhere but the public internet", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "[::1]", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "nonsense"])
    expect(privateAddress(ip)).toBe(true);
  for (const ip of ["1.1.1.1", "160.79.104.10", "2606:4700:4700::1111"]) expect(privateAddress(ip)).toBe(false);
});

test("a client can revoke a token it was given, but not a key someone made by hand", async () => {
  const { body: client } = await registered();
  const { verifier, challenge } = pkce();
  const { code } = await codeFor(client.client_id, challenge);
  const { access_token } = await (
    await token(form("/api/oauth/token", { grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id }))
  ).json();
  const handMade = `acta_${"k".repeat(32)}`;
  expect((await revoke(form("/api/oauth/revoke", { token: handMade, client_id: client.client_id }))).status).toBe(200);
  expect(await verifyKey(handMade)).not.toBeNull();
  expect((await revoke(form("/api/oauth/revoke", { token: access_token, client_id: client.client_id }))).status).toBe(200);
  expect(await verifyKey(access_token)).toBeNull();
});

test("nobody signed in can read the OAuth tables or set which client a key came from", () => {
  const dir = join(import.meta.dir, "..", "supabase", "migrations");
  const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes("mcp_sign_in"))!), "utf8").replace(/--[^\n]*/g, "");
  expect(sql).toMatch(/revoke all on public\.oauth_clients, public\.oauth_codes from anon, authenticated;/);
  expect(sql).not.toMatch(/grant [^;]*on public\.oauth_(clients|codes)[^;]*to [^;]*authenticated/);
  expect(sql).not.toMatch(/grant (insert|update)[^;]*\bclient\b[^;]*on public\.agent_keys/);
});
