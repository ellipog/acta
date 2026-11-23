import { requestOrigin } from "@/lib/origin";
import { protectedResourceMetadata } from "@/lib/oauth/metadata";
import { cors, preflight } from "@/lib/oauth/http";

// RFC 9728 protected resource metadata: tells an MCP client that got a 401 from /api/mcp where to sign in. The path
// after the name is the resource's own, so /.well-known/oauth-protected-resource/api/mcp describes /api/mcp
export async function GET(request: Request, { params }: RouteContext<"/.well-known/oauth-protected-resource/[[...path]]">) {
  const { path } = await params;
  const doc = protectedResourceMetadata(requestOrigin(request), path?.length ? `/${path.join("/")}` : "");
  if (!doc) return Response.json({ error: "not_found" }, { status: 404, headers: cors });
  return Response.json(doc, { headers: { ...cors, "Cache-Control": "public, max-age=3600" } });
}

export const OPTIONS = preflight;
