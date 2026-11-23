import { serviceReady } from "@/lib/supabase/admin";
import { revokeToken } from "@/lib/oauth/grants";
import { authenticateClient, json, oauthError, params, preflight } from "@/lib/oauth/http";

// Token revocation (RFC 7009), for clients that sign out. It answers the same whether or not the token was known
export async function POST(request: Request) {
  if (!serviceReady) return oauthError("temporarily_unavailable", "Signing in isn’t set up on this server.", 503);
  const body = await params(request);
  const token = body.get("token");
  if (!token) return oauthError("invalid_request", "Send the token to revoke.");
  const client = await authenticateClient(request, body);
  if (client === null)
    return oauthError("invalid_client", "Acta doesn’t know that client, or its secret is wrong.", 401, {
      "WWW-Authenticate": 'Basic realm="acta"',
    });
  await revokeToken(client === "unknown" ? null : client, token);
  return json({});
}

export const OPTIONS = preflight;
