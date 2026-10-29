import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cacheLife } from "next/cache";
import { pageFrom, type Tone } from "./board-store";
import type { PublicResult, PublicRoadmapData } from "./public-roadmap";
import { publicHref, siteUrl } from "./slugs";
import { createAdminClient, serviceReady } from "./supabase/admin";
import { authReady, supabaseKey, supabaseUrl } from "./supabase/env";

// What search engines, feeds and link previews see: published roadmaps as anyone sees them, read without a
// visitor's cookie so it can be cached and shared between them

/** The board Acta plans itself on, whose shipped work is the changelog */
export const actaBoard = ["aaen-studios", "acta"] as const;

/** A published roadmap as a visitor without an account sees it */
export async function publicRoadmap(workspace: string, board: string): Promise<PublicResult> {
  "use cache";
  cacheLife("hours");
  if (!authReady) return null;
  const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await db.rpc("public_roadmap", { p_workspace: workspace, p_board: board, p_visitor: null });
  return (data ?? null) as PublicResult;
}

export type Listed = { workspace: string; board: string; title: string; updated: string };

/** Published roadmaps with something on them, for the sitemap. Ones hidden from search engines are left out */
export async function listedRoadmaps(): Promise<Listed[]> {
  "use cache";
  cacheLife("hours");
  if (!serviceReady) return [];
  const db = createAdminClient();
  const { data: boards } = await db
    .from("boards")
    .select("id, slug, name, page, workspaces (slug)")
    .eq("roadmap_public", true)
    .limit(5000);
  if (!boards?.length) return [];
  const { data: tasks } = await db
    .from("tasks")
    .select("board_id, updated_at")
    .in(
      "board_id",
      boards.map((b) => b.id),
    )
    .eq("public", true)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(20000);
  const latest = new Map<string, string>();
  for (const t of tasks ?? []) if (!latest.has(t.board_id)) latest.set(t.board_id, t.updated_at);
  return boards.flatMap((b) => {
    const page = pageFrom(b.name, b.slug, (b.page ?? {}) as object);
    const updated = latest.get(b.id);
    const workspace = (b.workspaces as unknown as { slug: string } | null)?.slug;
    if (!workspace || !updated || page.hideFromSearch) return [];
    return [{ workspace, board: b.slug, title: page.title, updated }];
  });
}

/** A roadmap's address where search engines should find it: on the roadmap domain when there is one */
export const roadmapUrl = (workspace: string, board: string) => new URL(publicHref(workspace, board), siteUrl).href;

/** Shipped work on a roadmap, newest first */
export function shippedOn(data: PublicRoadmapData) {
  return data.tasks
    .filter((t) => t.status === "done" && t.shipped_on)
    .sort((a, b) => b.shipped_on!.localeCompare(a.shipped_on!) || b.number - a.number);
}

/** The first paragraph of a description, as plain text */
export function excerpt(markdown: string, max = 280) {
  const first = markdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("#") && !p.startsWith("```") && !/^[-*]\s/.test(p));
  if (!first) return "";
  const plain = first
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : plain;
}

// Inks for drawing outside the page's CSS, as in link preview images. The light theme's
export const inks = {
  page: "#f3f0e8",
  ink: "#1d2230",
  ink2: "#4a5060",
  ink3: "#7a7f8c",
  line: "#d9d4c8",
  tone: { lapis: "#2c4a8c", pyrite: "#b39a4a", malachite: "#2f6b57", hematite: "#9b3b2e" } satisfies Record<Tone, string>,
};

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Shipped work on a roadmap as an RSS feed, newest first */
export function shippedFeed(
  data: PublicRoadmapData,
  { title, link, self, about }: { title: string; link: string; self: string; about?: string },
) {
  const page = pageFrom(data.board.name, data.board.slug, data.board.page);
  const items = shippedOn(data).slice(0, 50).map((t) => {
    const id = `${data.board.prefix}-${t.number}`;
    const summary = excerpt(t.description, 600);
    return [
      "<item>",
      `<title>${escapeXml(t.title)}</title>`,
      `<link>${escapeXml(link)}</link>`,
      `<guid isPermaLink="false">${escapeXml(`${link}#${id}`)}</guid>`,
      `<pubDate>${new Date(`${t.shipped_on}T12:00:00Z`).toUTCString()}</pubDate>`,
      summary ? `<description>${escapeXml(summary)}</description>` : "",
      "</item>",
    ].join("");
  });
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${escapeXml(title)}</title>`,
    `<link>${escapeXml(link)}</link>`,
    `<description>${escapeXml(about || page.tagline || `What ${data.workspace.name} has shipped`)}</description>`,
    `<atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml" />`,
    "<language>en</language>",
    ...items,
    "</channel>",
    "</rss>",
  ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600" },
  });
}
