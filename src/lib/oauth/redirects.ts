// Where a client may ask to be sent back to after signing in, and whether an address matches one it registered

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const banned = new Set(["javascript", "data", "file", "vbscript", "blob", "about", "filesystem", "ftp", "ws", "wss"]);

export const isLoopback = (url: URL) => url.protocol === "http:" && loopbackHosts.has(url.hostname);

function parse(uri: string) {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

/**
 * Why a redirect address can't be used, or null when it can: https anywhere, plain http only back to this computer
 * (RFC 8252), or an app's own scheme like cursor:// or vscode://. No fragments and no passwords
 */
export function redirectProblem(uri: unknown): string | null {
  if (typeof uri !== "string" || !uri || uri.length > 2048) return "Each redirect address has to be a URL.";
  const url = parse(uri);
  if (!url) return `${uri} isn’t a URL.`;
  if (url.hash || uri.includes("#")) return `${uri} can’t have a fragment.`;
  if (url.username || url.password) return `${uri} can’t carry a user name or password.`;
  const scheme = url.protocol.slice(0, -1).toLowerCase();
  if (scheme === "https") return url.hostname ? null : `${uri} has no host.`;
  if (scheme === "http") return isLoopback(url) ? null : `${uri} has to use https, unless it goes back to localhost.`;
  if (banned.has(scheme)) return `${uri} uses a scheme that can’t be used for this.`;
  return null;
}

/**
 * Whether a client may be sent to an address. Matches are exact, except that an app on this computer may pick any
 * port when it starts, as RFC 8252 allows: http://127.0.0.1:53682/callback matches a registered
 * http://127.0.0.1/callback or http://127.0.0.1:8000/callback
 */
export function redirectAllowed(registered: readonly string[], asked: string) {
  if (registered.includes(asked)) return true;
  const want = parse(asked);
  if (!want || !isLoopback(want) || want.hash) return false;
  return registered.some((r) => {
    const have = parse(r);
    return (
      have !== null &&
      isLoopback(have) &&
      have.hostname === want.hostname &&
      have.pathname === want.pathname &&
      have.search === want.search
    );
  });
}

/** What to show people about where they'll be sent back to: a site, an app on this computer, or an app's scheme */
export function redirectPlace(uri: string) {
  const url = parse(uri);
  if (!url) return uri;
  if (isLoopback(url)) return "an app on this computer";
  if (url.protocol === "https:") return url.host;
  return `${url.protocol}//${url.host}`;
}

/** The address to send a client back to, with the given parameters added to what it already has */
export function backTo(uri: string, params: Record<string, string | undefined>) {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  return url.toString();
}
