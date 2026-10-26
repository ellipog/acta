import { createMcpHandler } from "@modelcontextprotocol/server";
import type { Agent } from "@/lib/agents/keys";
import { verifyKey } from "@/lib/agents/keys";
import { actaServer } from "@/lib/agents/server";
import { serviceReady } from "@/lib/supabase/admin";

// Stateless: every request builds a server for the key that sent it
const mcp = createMcpHandler(({ authInfo }) => actaServer(authInfo?.extra?.agent as Agent));

const refuse = (status: number, message: string) =>
  Response.json(
    { error: status === 401 ? "invalid_token" : "unavailable", error_description: message },
    { status, headers: status === 401 ? { "WWW-Authenticate": 'Bearer realm="acta", error="invalid_token"' } : {} },
  );

async function handle(request: Request) {
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
  return mcp.fetch(request, {
    authInfo: { token, clientId: agent.keyId, scopes: [agent.access], extra: { agent } },
  });
}

export { handle as DELETE, handle as GET, handle as POST };
