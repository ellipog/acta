import { createHash } from "node:crypto";
import { NextResponse, userAgent, type NextRequest } from "next/server";
import { createAdminClient, serviceReady } from "@/lib/supabase/admin";

let db: ReturnType<typeof createAdminClient> | null = null;
let salt: { day: string; value: string } | null = null;

const client = () => (db ??= createAdminClient());
const clip = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

async function todaysSalt() {
  const day = new Date().toISOString().slice(0, 10);
  if (salt?.day === day) return salt.value;
  const { data, error } = await client().rpc("analytics_salt");
  if (error || typeof data !== "string") return null;
  salt = { day, value: data };
  return data;
}

function cleanProps(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value)
    .filter(([key, v]) => key.length <= 40 && ["string", "number", "boolean"].includes(typeof v))
    .slice(0, 10)
    .map(([key, v]) => [key, typeof v === "string" ? v.slice(0, 100) : v]);
  return entries.length ? Object.fromEntries(entries) : null;
}

export async function POST(request: NextRequest) {
  const done = () => new NextResponse(null, { status: 204 });
  const bad = () => new NextResponse(null, { status: 400 });
  if (!serviceReady) return done();

  const agent = userAgent(request);
  if (agent.isBot) return done();

  const host = clip(request.headers.get("host"), 120) ?? "unknown";
  const origin = request.headers.get("origin");
  if (origin && URL.canParse(origin) && new URL(origin).host !== host) return new NextResponse(null, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad();
  }
  if (!body || typeof body !== "object") return bad();

  const kind = body.kind === "pageview" || body.kind === "event" ? body.kind : null;
  const path = clip(body.path, 300);
  if (!kind || !path?.startsWith("/")) return bad();
  const name = kind === "event" ? clip(body.name, 64) : null;
  if (kind === "event" && (!name || !/^[a-z0-9_.:-]+$/i.test(name))) return bad();

  const current = await todaysSalt();
  if (!current) return done();

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const visitor = createHash("sha256")
    .update(`${current}|${host}|${ip}|${request.headers.get("user-agent") ?? ""}`)
    .digest("hex")
    .slice(0, 32);
  const width = typeof body.width === "number" ? body.width : 0;
  const type = agent.device.type;
  const device = type === "mobile" || type === "tablet" ? type : type ? "other" : width && width < 640 ? "mobile" : "desktop";

  await client()
    .from("analytics_events")
    .insert({
      kind,
      name,
      host,
      path,
      referrer: clip(body.referrer, 120)?.replace(/^www\./, "") ?? null,
      utm_source: clip(body.utm_source, 100),
      utm_medium: clip(body.utm_medium, 100),
      utm_campaign: clip(body.utm_campaign, 100),
      country: clip(request.headers.get("x-vercel-ip-country"), 2),
      device,
      browser: clip(agent.browser.name, 40),
      os: clip(agent.os.name, 40),
      visitor,
      props: kind === "event" ? cleanProps(body.props) : null,
    });

  return done();
}
