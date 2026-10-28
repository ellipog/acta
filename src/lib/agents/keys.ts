import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { after } from "next/server";
import { createAdminClient, serviceReady } from "@/lib/supabase/admin";

export type Access = "read" | "write" | "manage";

export const accessRank: Record<Access, number> = { read: 1, write: 2, manage: 3 };

// Who an MCP or API request acts as. The hash goes to the database with every write, which checks it again
export type Agent = {
  keyId: string;
  hash: string;
  userId: string;
  name: string;
  access: Access;
  workspaces: string[] | null;
};

const shape = /^acta_[A-Za-z0-9_-]{32}$/;

export const keyHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function newKey() {
  const token = `acta_${randomBytes(24).toString("base64url")}`;
  return { token, hash: keyHash(token), hint: token.slice(-4) };
}

let db: ReturnType<typeof createAdminClient> | null = null;
export const agentDb = () => (db ??= createAdminClient());

export async function verifyKey(token: string): Promise<Agent | null> {
  if (!shape.test(token)) return null;
  const hash = keyHash(token);
  const { data } = await agentDb()
    .from("agent_keys")
    .select("id, user_id, name, access, workspaces, used_at")
    .eq("hash", hash)
    .maybeSingle();
  if (!data) return null;
  // Close enough for "last used", without a write on every call
  if (!data.used_at || Date.now() - Date.parse(data.used_at) > 10 * 60_000)
    after(async () => {
      await agentDb().from("agent_keys").update({ used_at: new Date().toISOString() }).eq("id", data.id);
    });
  return {
    keyId: data.id,
    hash,
    userId: data.user_id,
    name: data.name,
    access: data.access as Access,
    workspaces: data.workspaces,
  };
}

const refuse = (status: number, message: string) =>
  Response.json(
    { error: status === 401 ? "invalid_token" : "unavailable", error_description: message },
    { status, headers: status === 401 ? { "WWW-Authenticate": 'Bearer realm="acta", error="invalid_token"' } : {} },
  );

/** The key a request was sent with, for the MCP server and the HTTP API. A response instead when there's none */
export async function agentFor(request: Request): Promise<{ agent: Agent; token: string } | Response> {
  if (!serviceReady) return refuse(503, "Acta’s agent access isn’t set up on this server.");
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const agent = token ? await verifyKey(token) : null;
  if (!token || !agent)
    return refuse(
      401,
      token
        ? "That Acta key doesn’t work. It may have been revoked. Make a new one under Account → Agents."
        : "Send an Acta key as a bearer token. Make one under Account → Agents.",
    );
  return { agent, token };
}
