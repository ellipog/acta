import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "./env";

let client: SupabaseClient | undefined;

export function getBrowserClient() {
  // The live feed sends a heartbeat every 25 seconds or the server drops it. Browsers slow down timers in tabs
  // that are out of sight, so the heartbeat comes from a worker, whose timers keep time. The worker is made from
  // a blob: address, so a Content-Security-Policy added later needs worker-src blob: or the live feed won't stay up
  client ??= createBrowserClient(supabaseUrl, supabaseKey, { realtime: { worker: true } });
  return client;
}
