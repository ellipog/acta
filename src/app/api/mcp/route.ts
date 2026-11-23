import { createMcpHandler } from "@modelcontextprotocol/server";
import { agentFor, type Agent } from "@/lib/agents/keys";
import { actaServer } from "@/lib/agents/server";
import { maxFileBytes } from "@/lib/file-links";
import { cors, preflight } from "@/lib/oauth/http";
import { resourceMetadataUrl } from "@/lib/oauth/metadata";
import { requestOrigin } from "@/lib/origin";

// Stateless: every request builds a server for the key that sent it, out of tools made once for the whole process.
// upload_file sends a whole file as base64, a third larger than the file, so a request may be that big
const mcp = createMcpHandler(({ authInfo }) => actaServer(authInfo?.extra?.agent as Agent), {
  maxRequestBodySize: Math.ceil((maxFileBytes * 4) / 3) + 1024 * 1024,
});

// Keys come in a header, never a cookie, so any page may call the server, as browser-based MCP clients do
function withCors(response: Response) {
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
  return out;
}

// A request without a working key gets a 401 that points to the protected resource metadata, where a client that
// can sign people in finds out how. A key, from the header or from signing in, works the same either way
async function handle(request: Request) {
  const found = await agentFor(request, resourceMetadataUrl(requestOrigin(request), "/api/mcp"));
  if (found instanceof Response) return withCors(found);
  const { agent, token } = found;
  return withCors(
    await mcp.fetch(request, {
      authInfo: { token, clientId: agent.keyId, scopes: [agent.access], extra: { agent } },
    }),
  );
}

export { handle as DELETE, handle as GET, handle as POST, preflight as OPTIONS };
