import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { authReady, supabaseKey, supabaseUrl } from "@/lib/supabase/env";
import { publicHost, slugProblem } from "@/lib/slugs";

function publicRewrite(request: NextRequest) {
  if (!publicHost) return null;
  const host = request.headers.get("host")?.split(":")[0];
  if (host !== publicHost && host !== `www.${publicHost}`) return null;
  const parts = request.nextUrl.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || slugProblem(parts[0])) return null;
  const url = request.nextUrl.clone();
  url.pathname = `/p/${parts[0]}/${parts[1]}`;
  return url;
}

export async function proxy(request: NextRequest) {
  const rewrite = publicRewrite(request);
  const pass = () => (rewrite ? NextResponse.rewrite(rewrite, { request }) : NextResponse.next({ request }));
  let response = pass();
  // Without a session cookie there's nothing to refresh
  if (!authReady || !request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return response;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = pass();
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();

  // Signed-in visits to /home go straight to the last board, skipping two server redirects.
  // The board page sends people to the workspace if that board is gone, and to /home?stale if the
  // workspace is, which forgets it so /home picks another one
  const last = request.cookies.get("acta-last")?.value;
  if (request.nextUrl.pathname === "/home" && request.nextUrl.searchParams.has("stale")) {
    response.cookies.delete("acta-last");
    return response;
  }
  if (request.nextUrl.pathname === "/home" && data?.claims && last && /^[a-z0-9-]+\/[a-z0-9-]+$/.test(last)) {
    const redirect = NextResponse.redirect(new URL(`/${last}`, request.url));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/collect|api/mcp|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|txt|xml)$).*)"],
};
