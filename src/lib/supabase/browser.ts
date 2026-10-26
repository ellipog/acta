import type { SupabaseClient } from "@supabase/supabase-js";

// supabase-js is one of the largest downloads on the site, so pages fetch it only when they first talk to Supabase
export const loadClient = (): Promise<SupabaseClient> => import("./client").then((m) => m.getBrowserClient());

// The session lives in cookies the page can read, so this says whether anyone is signed in without supabase-js
export const hasSession = () => /(?:^|; )sb-[^=]*-auth-token(?:\.\d+)?=/.test(document.cookie);
