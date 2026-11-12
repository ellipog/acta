// The public origin a request came in on, such as https://acta.aaenz.no.
// Behind a proxy (Vercel, or the Cloudflare Tunnel on a VPS), request.url carries the address the server
// listens on (http://localhost:4660 when self-hosted), so redirects built from it send people there.
// The Host header is the domain the visitor used: Cloudflare and Vercel only route requests whose Host
// is one of the site's own domains, so it can't point a redirect elsewhere.
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (!host) return url.origin;
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwarded === "https" || forwarded === "http" ? forwarded : url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
