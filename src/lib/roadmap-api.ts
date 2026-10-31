import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PublicPage } from "./board-store";
import { isPrivate, type PublicResult, type PublicRoadmapData } from "./public-roadmap";
import {
  ideaJson,
  isUuid,
  isVisitor,
  queryTasks,
  readTaskQuery,
  roadmapCors,
  roadmapKeyShape,
  roadmapPage,
  shownTasks,
  stageFor,
  taskJson,
  taskNumber,
} from "./roadmap-json";
import { publicHref } from "./slugs";
import { createAdminClient, serviceReady } from "./supabase/admin";
import { authReady, supabaseKey, supabaseUrl } from "./supabase/env";

// The roadmap API: a board's public roadmap for any site to build in, with a roadmap key made under the board's
// Public roadmap → Customize → API. It reads what the public page shows and votes and sends ideas as the page does,
// with the same limits, through the same database functions. It's apart from the owner's HTTP API at /api/v1,
// which acts as a person and can change anything they can

type KeyUse = {
  key: string;
  board: string;
  workspace_slug: string;
  board_slug: string;
  prefix: string;
  origins: string[];
  allowed: boolean;
  retry_after: number;
};

class Refusal {
  constructor(
    public status: number,
    public message: string,
    public headers: Record<string, string> = {},
  ) {}
}

let admin: SupabaseClient | null = null;
let anon: SupabaseClient | null = null;
const adminDb = () => (admin ??= createAdminClient());
// Reading, voting and sending ideas go through the functions the public page calls, as a visitor would
const anonDb = () =>
  (anon ??= createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } }));

/** The key a call came with: a bearer token, an X-Acta-Key header or ?key= */
export function tokenOf(request: Request) {
  return (
    request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ??
    request.headers.get("x-acta-key")?.trim() ??
    new URL(request.url).searchParams.get("key")
  );
}

// Who's calling, for the limits. Only a hash of the address is kept
function callerOf(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "?";
  return createHash("sha256").update(`acta-roadmap:${ip}`).digest("hex").slice(0, 32);
}

type Route = { write: boolean; run: (c: Ctx) => Promise<Response> };
type Ctx = {
  request: Request;
  url: URL;
  use: KeyUse;
  send: (data: unknown, status?: number, cache?: string) => Response;
};

async function body(request: Request) {
  const text = await request.text();
  if (!text.trim()) return {} as Record<string, unknown>;
  try {
    const v = JSON.parse(text) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {}
  throw new Refusal(400, "The body must be a JSON object.");
}

// A site's id for its visitor, as the database keeps it: hashed with the board, so the site's own ids aren't kept,
// and they can't stand for the page's own visitors or another board's
function visitorFrom(value: unknown, required: boolean, board: string) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new Refusal(400, "Send visitor: your site’s own id for the person, so each counts once.");
    return null;
  }
  if (!isVisitor(value)) throw new Refusal(400, "visitor must be 8 to 64 letters, numbers and hyphens.");
  return `v:api-${createHash("sha256").update(`${board}:${value}`).digest("hex").slice(0, 40)}`;
}

function onFrom(value: unknown) {
  if (value === undefined) return true;
  if (typeof value !== "boolean") throw new Refusal(400, "on must be true to vote or false to take the vote back.");
  return value;
}

async function load(use: KeyUse, visitor: string | null): Promise<{ data: PublicRoadmapData; page: PublicPage }> {
  const { data, error } = await anonDb().rpc("public_roadmap", {
    p_workspace: use.workspace_slug,
    p_board: use.board_slug,
    p_visitor: visitor,
  });
  if (error) throw new Refusal(503, "The roadmap couldn’t be read just now. Try again.");
  const r = data as PublicResult;
  if (!r || isPrivate(r)) throw new Refusal(404, "This board’s roadmap isn’t published. Make it public to use the API.");
  return { data: r, page: roadmapPage(r) };
}

// GETs without a visitor are the same for everyone, so browsers may keep them a little while
const cacheFor = (visitor: string | null) => (visitor ? "no-store" : "private, max-age=30");

const routes: Record<string, Partial<Record<"GET" | "POST", Route>>> = {
  "": {
    GET: {
      write: false,
      async run({ use, url, request, send }) {
        const visitor = visitorFrom(url.searchParams.get("visitor"), false, use.board);
        const { data, page } = await load(use, visitor);
        const tasks = shownTasks(data, page);
        const count = (s: string) => tasks.filter((t) => stageFor(t.status) === s).length;
        return send(
          {
            workspace: { name: data.workspace.name, slug: data.workspace.slug, image: data.workspace.image ?? null },
            board: { name: data.board.name, slug: data.board.slug, prefix: data.board.prefix },
            url: new URL(publicHref(data.workspace.slug, data.board.slug), request.url).href,
            page: {
              title: page.title,
              tagline: page.tagline,
              stages: page.stageNames,
              announcement: page.announcement || null,
              links: page.links,
              projects: page.showProjects ? (data.board.projects ?? []) : [],
              voting: page.voting,
              ideas: { open: page.ideas, public: page.ideasPublic, one: page.ideaOne, many: page.ideaMany, prompt: page.ideaPrompt },
              shows: {
                shipped: page.showShipped,
                dates: page.showDates,
                time_to_close: page.showTimeTaken,
                progress: page.showProgress,
                team: page.showTeam,
                labels: page.showLabels,
              },
            },
            counts: {
              planned: count("planned"),
              progress: count("progress"),
              shipped: count("shipped"),
              ideas: data.suggestions.length,
            },
          },
          200,
          cacheFor(visitor),
        );
      },
    },
  },
  tasks: {
    GET: {
      write: false,
      async run({ use, url, send }) {
        const visitor = visitorFrom(url.searchParams.get("visitor"), false, use.board);
        const q = readTaskQuery(url.searchParams);
        if (typeof q === "string") throw new Refusal(400, q);
        const { data, page } = await load(use, visitor);
        const all = shownTasks(data, page).map((t) => taskJson(data, page, t, { visitor: Boolean(visitor) }));
        return send(queryTasks(all, q), 200, cacheFor(visitor));
      },
    },
  },
  "tasks/:id": {
    GET: {
      write: false,
      async run({ use, url, send }) {
        const visitor = visitorFrom(url.searchParams.get("visitor"), false, use.board);
        const n = taskNumber(param(url, 1), use.prefix);
        const { data, page } = await load(use, visitor);
        const t = n === null ? undefined : shownTasks(data, page).find((x) => x.number === n);
        if (!t) throw new Refusal(404, `There’s no ${param(url, 1)} on this roadmap.`);
        return send({ task: taskJson(data, page, t, { visitor: Boolean(visitor) }) }, 200, cacheFor(visitor));
      },
    },
  },
  "tasks/:id/vote": {
    POST: {
      write: true,
      async run({ use, url, request, send }) {
        const b = await body(request);
        const visitor = visitorFrom(b.visitor, true, use.board)!;
        const on = onFrom(b.on);
        const ref = param(url, 1);
        const n = taskNumber(ref, use.prefix);
        if (n === null) throw new Refusal(404, `There’s no ${ref} on this roadmap.`);
        const { data, error } = await anonDb().rpc("public_vote", {
          p_board: use.board,
          p_number: n,
          p_visitor: visitor,
          p_on: on,
        });
        if (error?.code === "P0002")
          throw new Refusal(404, `There’s no ${ref} on this roadmap, or the roadmap doesn’t take votes.`);
        if (error) throw dbRefusal(error);
        return send({ id: `${use.prefix}-${n}`, votes: data as number, voted: on });
      },
    },
  },
  ideas: {
    GET: {
      write: false,
      async run({ use, url, send }) {
        const visitor = visitorFrom(url.searchParams.get("visitor"), false, use.board);
        const sort = url.searchParams.get("sort") ?? "top";
        if (sort !== "top" && sort !== "new") throw new Refusal(400, "sort must be top or new.");
        const { data, page } = await load(use, visitor);
        const ideas = data.suggestions
          .map((s) => ideaJson(page, s, { visitor: Boolean(visitor) }))
          .sort((a, b) => (sort === "new" ? Date.parse(b.at) - Date.parse(a.at) : (b.votes ?? 0) - (a.votes ?? 0)));
        return send({ public: page.ideasPublic, ideas }, 200, cacheFor(visitor));
      },
    },
    POST: {
      write: true,
      async run({ use, request, send }) {
        const b = await body(request);
        const visitor = visitorFrom(b.visitor, true, use.board)!;
        const title = typeof b.title === "string" ? b.title.trim() : "";
        if (!title) throw new Refusal(400, "Send a title.");
        if (title.length > 200) throw new Refusal(400, "title can be up to 200 characters.");
        if (b.details !== undefined && b.details !== null && typeof b.details !== "string")
          throw new Refusal(400, "details must be text.");
        const details = typeof b.details === "string" ? b.details.trim() : "";
        if (details.length > 2000) throw new Refusal(400, "details can be up to 2000 characters.");
        const { data, error } = await anonDb().rpc("public_suggest", {
          p_board: use.board,
          p_id: randomUUID(),
          p_title: title,
          p_details: details || null,
          p_visitor: visitor,
        });
        if (error?.code === "PT429")
          throw new Refusal(
            429,
            "That’s as many as can be sent today: 10 from each visitor, and 300 to each board. Try again tomorrow.",
          );
        if (error?.code === "P0002") throw new Refusal(403, "This roadmap doesn’t take ideas.");
        if (error) throw dbRefusal(error);
        const saved = data as { id: string; by: string; at: string; votes: number } | null;
        if (!saved) throw new Refusal(409, "That idea was already sent.");
        return send(
          { idea: { id: saved.id, title, details: details || null, by: saved.by, at: saved.at, votes: saved.votes, voted: true } },
          201,
        );
      },
    },
  },
  "ideas/:id/vote": {
    POST: {
      write: true,
      async run({ use, url, request, send }) {
        const b = await body(request);
        const visitor = visitorFrom(b.visitor, true, use.board)!;
        const on = onFrom(b.on);
        const id = param(url, 1);
        const missing = new Refusal(404, "There’s no such idea on this roadmap, or its ideas don’t take votes.");
        if (!isUuid(id)) throw missing;
        // The database function takes any board's idea, so the key's own board is checked here first
        const { data: found } = await adminDb()
          .from("suggestions")
          .select("id")
          .eq("id", id)
          .eq("board_id", use.board)
          .maybeSingle();
        if (!found) throw missing;
        const { data, error } = await anonDb().rpc("public_vote_suggestion", {
          p_suggestion: id,
          p_visitor: visitor,
          p_on: on,
        });
        if (error?.code === "P0002") throw missing;
        if (error) throw dbRefusal(error);
        return send({ id, votes: data as number, voted: on });
      },
    },
  },
};

function dbRefusal(error: { code?: string; message?: string }) {
  if (error.code === "22023") return new Refusal(400, "visitor must be 8 to 64 letters, numbers and hyphens.");
  console.error("Roadmap API", error);
  return new Refusal(503, "That didn’t go through. Try again.");
}

// The path after /api/roadmap/v1, as the routes above name it, and its own values
const segments = (url: URL) => url.pathname.replace(/^\/api\/roadmap\/v1\/?/, "").split("/").filter(Boolean);
const param = (url: URL, i: number) => {
  const raw = segments(url)[i] ?? "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export function routeFor(path: string[]) {
  const [a, id, c, ...rest] = path;
  if (rest.length) return null;
  const name = !a ? "" : !id ? a : !c ? `${a}/:id` : `${a}/:id/${c}`;
  return routes[name] ? name : null;
}

export async function roadmapApi(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  // Until the key is known, its errors can be read from any site
  let cors = roadmapCors([], origin).headers;
  const send = (data: unknown, status = 200, cache = "no-store") =>
    Response.json(data, { status, headers: { ...cors, "Cache-Control": cache } });
  const fail = (r: Refusal) =>
    Response.json({ error: r.message }, { status: r.status, headers: { ...cors, "Cache-Control": "no-store", ...r.headers } });

  const name = routeFor(segments(url));
  if (name === null) return fail(new Refusal(404, "There’s nothing here. See /docs/roadmap-api for what there is."));
  const method = request.method === "HEAD" ? "GET" : request.method;
  const route = routes[name][method as "GET" | "POST"];
  if (!route) {
    const allow = [...Object.keys(routes[name]), "OPTIONS"].join(", ");
    return fail(new Refusal(405, `Use ${allow.replace(", OPTIONS", "")} here.`, { Allow: allow }));
  }
  if (!authReady || !serviceReady) return fail(new Refusal(503, "The roadmap API isn’t set up on this server."));

  const token = tokenOf(request);
  if (!token)
    return fail(
      new Refusal(
        401,
        "Send a roadmap key, as ?key=, an X-Acta-Key header or a bearer token. Make one under the board’s Public roadmap → Customize → API.",
      ),
    );
  if (!roadmapKeyShape.test(token)) return fail(new Refusal(401, "That isn’t a roadmap key. They start with acta_pk_."));

  const { data, error } = await adminDb().rpc("use_roadmap_key", {
    p_token: token,
    p_who: callerOf(request),
    p_write: route.write,
  });
  if (error) {
    console.error("Roadmap key check failed", error);
    return fail(new Refusal(503, "The roadmap API isn’t available right now."));
  }
  const use = data as KeyUse | null;
  if (!use) return fail(new Refusal(401, "That roadmap key doesn’t work. It may have been rotated or revoked."));
  const c = roadmapCors(use.origins ?? [], origin);
  if (!c.allowed) return fail(new Refusal(403, `This key works only from ${use.origins.join(", ")}.`));
  cors = c.headers;
  if (!use.allowed)
    return fail(new Refusal(429, "Too many calls. Wait a minute.", { "Retry-After": String(use.retry_after) }));

  try {
    return await route.run({ request, url, use, send });
  } catch (e) {
    if (e instanceof Refusal) return fail(e);
    console.error("Roadmap API", e);
    return fail(new Refusal(500, "Something went wrong. Try again."));
  }
}

/** Preflight. The key isn't sent with it, so the call itself is where a key's sites are checked */
export function roadmapPreflight(request: Request) {
  const origin = request.headers.get("origin");
  const headers = roadmapCors([], origin).headers;
  return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Origin": origin ?? "*" } });
}
