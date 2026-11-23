// The public origin a request came in on, such as https://acta.aaenz.no.
// Behind a proxy (Vercel, or the Cloudflare Tunnel on a VPS), request.url carries the address the server
// listens on (http://localhost:4660 when self-hosted), so redirects built from it send people there.
// The Host header is the domain the visitor used: Cloudflare and Vercel only route requests whose Host
// is one of the site's own domains, so it can't point a redirect elsewhere.
/** The same from a page or server action, which only has the headers. Without a forwarded protocol, only
 * localhost is taken to be plain http */
export function headersOrigin(headers: Headers, fallback: string): string {
  const host = headers.get("host");
  if (!host) return fallback;
  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = forwarded === "https" || forwarded === "http" ? forwarded : local ? "http" : "https";
  return `${proto}://${host}`;
}

export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (!host) return url.origin;
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwarded === "https" || forwarded === "http" ? forwarded : url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
