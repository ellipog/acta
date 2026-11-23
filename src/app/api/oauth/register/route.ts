import { serviceReady } from "@/lib/supabase/admin";
import { registerClient, RegistrationProblem } from "@/lib/oauth/clients";
import { json, oauthError, preflight } from "@/lib/oauth/http";

// Dynamic client registration (RFC 7591), for MCP clients that don't publish a client metadata document
export async function POST(request: Request) {
  if (!serviceReady) return oauthError("temporarily_unavailable", "Signing in isn’t set up on this server.", 503);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_client_metadata", "Send the client’s metadata as JSON.");
  }
  try {
    return json(await registerClient(body), 201);
  } catch (error) {
    if (error instanceof RegistrationProblem) return oauthError(error.code, error.message);
    console.error("Client registration failed", error);
    return oauthError("server_error", "The client couldn’t be registered. Try again.", 500);
  }
}

export const OPTIONS = preflight;
