// Node's fetch closes a connection after 4 s without use, so on a quiet server nearly every page opened its reads
// to Supabase from scratch: a TCP and a TLS handshake for each of the six or so it makes at once. Connections are
// kept half a minute instead, which Supabase's own idle limit is well above
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { Agent, setGlobalDispatcher } = await import("undici");
  setGlobalDispatcher(new Agent({ keepAliveTimeout: 30_000, keepAliveMaxTimeout: 120_000 }));
}
