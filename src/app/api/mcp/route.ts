import { createMcpHandler } from "@modelcontextprotocol/server";
import { agentFor, type Agent } from "@/lib/agents/keys";
import { actaServer } from "@/lib/agents/server";

// Stateless: every request builds a server for the key that sent it, out of tools made once for the whole process
const mcp = createMcpHandler(({ authInfo }) => actaServer(authInfo?.extra?.agent as Agent));

async function handle(request: Request) {
  const found = await agentFor(request);
  if (found instanceof Response) return found;
  const { agent, token } = found;
  return mcp.fetch(request, {
    authInfo: { token, clientId: agent.keyId, scopes: [agent.access], extra: { agent } },
  });
}

export { handle as DELETE, handle as GET, handle as POST };
