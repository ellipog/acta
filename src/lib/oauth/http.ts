import "server-only";
import { findClient, secretMatches, type Client } from "./clients";

// What the OAuth endpoints share: CORS, since browser-based MCP clients call them straight from the page, and none of
// them read cookies; answers that are never cached; and reading a client's parameters and credentials from a request

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export const preflight = () => new Response(null, { status: 204, headers: cors });

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...cors, "Cache-Control": "no-store", Pragma: "no-cache", ...headers } });
}

export const oauthError = (error: string, description: string, status = 400, headers: Record<string, string> = {}) =>
  json({ error, error_description: description }, status, headers);

/** A request's parameters, from a form body as OAuth sends them, or JSON from clients that send that instead */
export async function params(request: Request): Promise<URLSearchParams> {
  const text = await request.text();
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      const out = new URLSearchParams();
      for (const [k, v] of Object.entries(body ?? {})) if (typeof v === "string") out.set(k, v);
      return out;
    } catch {
      return new URLSearchParams();
    }
  }
  return new URLSearchParams(text);
}

/**
 * The client a token or revocation request comes from, by HTTP Basic (client_secret_basic) or the body
 * (client_secret_post, or a public client's client_id alone). Null when there's no such client or its secret is wrong
 */
export async function authenticateClient(request: Request, body: URLSearchParams): Promise<Client | null | "unknown"> {
  let id = body.get("client_id");
  let secret = body.get("client_secret");
  const basic = request.headers.get("authorization")?.match(/^Basic\s+(\S+)$/i)?.[1];
  if (basic) {
    const decoded = Buffer.from(basic, "base64").toString("utf8");
    const at = decoded.indexOf(":");
    if (at > 0) {
      // RFC 6749 2.3.1: both halves are form-encoded before they're joined
      const decode = (s: string) => {
        try {
          return decodeURIComponent(s.replace(/\+/g, " "));
        } catch {
          return s;
        }
      };
      id = decode(decoded.slice(0, at));
      secret = decode(decoded.slice(at + 1));
    }
  }
  if (!id) return "unknown";
  let client: Client | null;
  try {
    client = await findClient(id);
  } catch {
    return null;
  }
  if (!client || !secretMatches(client, secret)) return null;
  return client;
}
