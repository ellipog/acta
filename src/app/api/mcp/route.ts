import { createMcpHandler } from "@modelcontextprotocol/server";
import { agentFor, type Agent } from "@/lib/agents/keys";
import { actaServer } from "@/lib/agents/server";
import { maxFileBytes } from "@/lib/file-links";

// Stateless: every request builds a server for the key that sent it, out of tools made once for the whole process.
// upload_file sends a whole file as base64, a third larger than the file, so a request may be that big
const mcp = createMcpHandler(({ authInfo }) => actaServer(authInfo?.extra?.agent as Agent), {
  maxRequestBodySize: Math.ceil((maxFileBytes * 4) / 3) + 1024 * 1024,
});

async function handle(request: Request) {
  const found = await agentFor(request);
  if (found instanceof Response) return found;
  const { agent, token } = found;
  return mcp.fetch(request, {
    authInfo: { token, clientId: agent.keyId, scopes: [agent.access], extra: { agent } },
  });
}

export { handle as DELETE, handle as GET, handle as POST };
