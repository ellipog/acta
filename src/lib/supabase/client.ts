import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "./env";

let client: SupabaseClient | undefined;

export function getBrowserClient() {
  client ??= createBrowserClient(supabaseUrl, supabaseKey);
  return client;
}
