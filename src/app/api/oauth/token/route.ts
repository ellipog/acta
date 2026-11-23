import { requestOrigin } from "@/lib/origin";
import { serviceReady } from "@/lib/supabase/admin";
import { GrantProblem, redeemCode } from "@/lib/oauth/grants";
import { authenticateClient, json, oauthError, params, preflight } from "@/lib/oauth/http";

// The token endpoint: trades an authorization code and its PKCE verifier for an Acta key
export async function POST(request: Request) {
  if (!serviceReady) return oauthError("temporarily_unavailable", "Signing in isn’t set up on this server.", 503);
  const body = await params(request);
  const grant = body.get("grant_type");
  if (!grant) return oauthError("invalid_request", "Send a grant_type.");
  if (grant !== "authorization_code")
    return oauthError("unsupported_grant_type", "Acta gives tokens for authorization codes only. Its tokens last until they’re revoked.");

  const client = await authenticateClient(request, body);
  if (client === "unknown") return oauthError("invalid_request", "Send the client_id.");
  if (!client)
    return oauthError("invalid_client", "Acta doesn’t know that client, or its secret is wrong.", 401, {
      "WWW-Authenticate": 'Basic realm="acta"',
    });

  try {
    const tokens = await redeemCode(
      client,
      {
        code: body.get("code"),
        verifier: body.get("code_verifier"),
        redirectUri: body.get("redirect_uri"),
        resource: body.get("resource"),
      },
      requestOrigin(request),
    );
    return json(tokens);
  } catch (error) {
    if (error instanceof GrantProblem) return oauthError(error.code, error.message);
    console.error("Token request failed", error);
    return oauthError("server_error", "The token couldn’t be made. Try signing in again.", 500);
  }
}

export const OPTIONS = preflight;
