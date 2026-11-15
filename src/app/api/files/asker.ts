import "server-only";
import { accessRank, verifyKey } from "@/lib/agents/keys";
import type { Asker } from "@/lib/files";
import { authReady } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Who sent a request for a file: an agent by its key, a person by their session, or nobody. A key that doesn't
 * work is turned away rather than read as nobody, so an agent learns its key is wrong
 */
export async function askerFor(request: Request): Promise<Asker | "bad key"> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (token) {
    const agent = await verifyKey(token);
    if (!agent) return "bad key";
    return { userId: agent.userId, workspaces: agent.workspaces, agentWrites: accessRank[agent.access] >= accessRank.write };
  }
  if (!authReady || !request.headers.get("cookie")?.includes("sb-")) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? { userId: sub } : null;
}
