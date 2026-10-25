import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

const secret = process.env.SUPABASE_SECRET_KEY ?? "";
export const serviceReady = Boolean(supabaseUrl && secret);

export function createAdminClient() {
  return createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
