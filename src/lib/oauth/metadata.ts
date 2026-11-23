// Where Acta's OAuth endpoints are and what it supports, for MCP clients that sign in instead of sending a key.
// Everything is built from the origin a request came in on (see origin.ts), since Acta is self-hosted behind a
// tunnel and also runs on localhost while developing

export const scopes = ["read", "write", "manage"] as const;

// The resources a token can be for, by path. A client may name the server itself or the whole site
export const resourcePaths = ["", "/api/mcp", "/api/v1"] as const;

export function endpoints(origin: string) {
  return {
    issuer: origin,
    authorize: `${origin}/oauth/authorize`,
    token: `${origin}/api/oauth/token`,
    register: `${origin}/api/oauth/register`,
    revoke: `${origin}/api/oauth/revoke`,
    docs: `${origin}/docs/agents`,
  };
}

/** Protected resource metadata's address for a resource path, as RFC 9728 builds it: the path goes after the name */
export const resourceMetadataUrl = (origin: string, path: (typeof resourcePaths)[number]) =>
  `${origin}/.well-known/oauth-protected-resource${path}`;

/** RFC 8414 authorization server metadata */
export function authorizationServerMetadata(origin: string) {
  const e = endpoints(origin);
  const auth = ["none", "client_secret_post", "client_secret_basic"];
  return {
    issuer: e.issuer,
    authorization_endpoint: e.authorize,
    token_endpoint: e.token,
    registration_endpoint: e.register,
    revocation_endpoint: e.revoke,
    scopes_supported: [...scopes],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: auth,
    revocation_endpoint_auth_methods_supported: auth,
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: e.docs,
  };
}

/** RFC 9728 protected resource metadata, for the site or one of its APIs. Null for paths that aren't a resource */
export function protectedResourceMetadata(origin: string, path: string) {
  const known = resourcePaths.find((p) => p === path.replace(/\/+$/, ""));
  if (known === undefined) return null;
  return {
    resource: `${origin}${known}`,
    authorization_servers: [origin],
    scopes_supported: [...scopes],
    bearer_methods_supported: ["header"],
    resource_name: "Acta",
    resource_documentation: endpoints(origin).docs,
  };
}

/** Whether a resource a client asked a token for (RFC 8707) is one of Acta's */
export function ourResource(origin: string, resource: string) {
  const clean = resource.replace(/#.*$/, "").replace(/\/+$/, "");
  return resourcePaths.some((p) => clean === `${origin}${p}`);
}
