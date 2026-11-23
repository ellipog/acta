import { requestOrigin } from "@/lib/origin";
import { authorizationServerMetadata } from "@/lib/oauth/metadata";
import { cors, preflight } from "@/lib/oauth/http";

// RFC 8414 authorization server metadata. Acta's issuer is the site itself, so the document lives at the root. Clients
// that put the MCP server's path after the name, as some older ones do, get the same document
export async function GET(request: Request) {
  return Response.json(authorizationServerMetadata(requestOrigin(request)), {
    headers: { ...cors, "Cache-Control": "public, max-age=3600" },
  });
}

export const OPTIONS = preflight;
