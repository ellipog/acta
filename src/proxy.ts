import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { authReady, supabaseKey, supabaseUrl } from "@/lib/supabase/env";
import { publicHost, slugProblem } from "@/lib/slugs";

function publicRewrite(request: NextRequest) {
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
  if (!authReady) return response;

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

  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/collect|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|txt|xml)$).*)"],
};
