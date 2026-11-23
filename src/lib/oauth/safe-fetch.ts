import "server-only";
import { lookup, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, fetch } from "undici";

// Fetches an address a stranger gave us, such as a client's metadata document, without letting it reach anything
// but the public internet: no localhost, private networks, link-local cloud metadata addresses and the like. The
// check runs when the connection is made, on the address it's made to, so a name that resolves to a public address
// once and a private one the next time still can't get through

const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net, bits, "ipv6");

// An IPv4 address written as IPv6 (::ffff:127.0.0.1) is checked as the IPv4 address it is. BlockList can't be given
// ::ffff:0:0/96 itself, since it then matches every IPv4 address too
function mappedV4(v6: string) {
  const canonical = new URL(`http://[${v6}]`).hostname.slice(1, -1);
  const m = canonical.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!m) return null;
  const [hi, lo] = [parseInt(m[1], 16), parseInt(m[2], 16)];
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** Whether an IP address is somewhere other than the public internet */
export function privateAddress(address: string) {
  const bare = address.replace(/^\[|\]$/g, "");
  const family = isIP(bare);
  if (!family) return true;
  if (family === 4) return blocked.check(bare, "ipv4");
  const v4 = mappedV4(bare);
  return v4 ? blocked.check(v4, "ipv4") : blocked.check(bare, "ipv6");
}

const refused = () => Object.assign(new Error("That address isn’t on the public internet."), { code: "EACCES" });

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

const dispatcher = new Agent({
  connect: {
    timeout: 5_000,
    lookup(hostname: string, options: { all?: boolean }, callback: LookupCallback) {
      lookup(hostname, { all: true }, (error, addresses) => {
        if (error) return callback(error, "");
        const list = addresses as LookupAddress[];
        if (!list.length || list.some((a) => privateAddress(a.address))) return callback(refused(), "");
        if (options?.all) return callback(null, list);
        callback(null, list[0].address, list[0].family);
      });
    },
  },
  headersTimeout: 5_000,
  bodyTimeout: 5_000,
});

/**
 * GETs a public https address and returns its body as text, up to maxBytes. Redirects aren't followed. Throws when
 * the address is private, the answer isn't 200, it's too large or it takes more than five seconds
 */
export async function fetchPublic(address: string, maxBytes = 32 * 1024): Promise<{ text: string; type: string; maxAge: number | null }> {
  const url = new URL(address);
  if (url.protocol !== "https:") throw new Error("Only https addresses can be fetched.");
  // A connection to an address given as a number skips the name lookup, so it's checked here
  if (isIP(url.hostname.replace(/^\[|\]$/g, "")) && privateAddress(url.hostname)) throw refused();
  const response = await fetch(url, {
    dispatcher,
    redirect: "manual",
    signal: AbortSignal.timeout(5_000),
    headers: { accept: "application/json" },
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error(`It answered ${response.status}.`);
  }
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > maxBytes) {
    await response.body?.cancel();
    throw new Error("It’s too large.");
  }
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("It’s too large.");
    }
    chunks.push(value);
  }
  const maxAge = response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1];
  return {
    text: Buffer.concat(chunks).toString("utf8"),
    type: response.headers.get("content-type") ?? "",
    maxAge: maxAge ? Number(maxAge) : null,
  };
}
