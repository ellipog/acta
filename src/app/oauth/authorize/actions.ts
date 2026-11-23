"use server";

import { headers } from "next/headers";
import { keyLimits, type KeyLimits } from "@/lib/agents/limits";
import { checkAuthorize, connectionCap, connections, issueCode } from "@/lib/oauth/grants";
import { headersOrigin } from "@/lib/origin";
import { siteUrl } from "@/lib/slugs";
import { createClient } from "@/lib/supabase/server";
import { authorizeQuery } from "./query";

export type Allowed = { ok: true; url: string } | { ok: false; message: string };

// The person pressed Allow. Everything about the request is checked again, since it came back from the browser, and
// the answer is the address to send them back to the app with a code
export async function allowAgent(query: Record<string, unknown>, choice: KeyLimits): Promise<Allowed> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, message: "You’ve been signed out. Sign in and connect again." };
  const origin = headersOrigin(await headers(), siteUrl);
  const clean = authorizeQuery(query);
  if (!clean) return { ok: false, message: "This sign-in request isn’t complete. Start connecting again from the app." };
  const check = await checkAuthorize(clean, origin);
  if ("show" in check) return { ok: false, message: check.show };
  if ("send" in check) return { ok: true, url: check.send };
  const workspaces = Array.isArray(choice?.workspaces) ? choice.workspaces : null;
  const limits = keyLimits(choice?.name, choice?.access, workspaces !== null, workspaces ?? []);
  if (typeof limits === "string") return { ok: false, message: limits };
  if ((await connections(data.user.id)) >= connectionCap)
    return { ok: false, message: `You have ${connectionCap} agents signed in. Disconnect one under Account → Agents first.` };
  return { ok: true, url: await issueCode(check, data.user.id, limits, origin) };
}
