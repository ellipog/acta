import { comparisons } from "@/lib/compare";
import { docPages, docUrl } from "@/lib/docs";
import { actaRoadmapHref, siteUrl } from "@/lib/slugs";
import { useCases } from "@/lib/use-cases";

// A map of Acta for AI tools, as llmstxt.org describes: what it is, then links to pages worth reading
export function GET() {
  const at = (path: string) => new URL(path, siteUrl).href;
  const body = [
    "# Acta",
    "",
    "> A project manager for small teams and the AI agents that work with them: boards, tables, a timeline and public roadmaps, with an MCP server and HTTP API for agents and GitHub links that move tasks along.",
    "",
    `Every page of the docs in one file: ${at("/llms-full.txt")}`,
    "",
    "## Docs",
    "",
    ...docPages.map((d) => `- [${d.title}](${docUrl(d.slug)}): ${d.description}`),
    "",
    "## Use cases",
    "",
    ...useCases.map((u) => `- [${u.title}](${at(`/use-cases/${u.slug}`)}): ${u.description}`),
    "",
    "## Optional",
    "",
    ...comparisons.map((c) => `- [${c.title}](${at(`/compare/${c.slug}`)}): ${c.description}`),
    `- [Changelog](${at("/changelog")}): everything shipped, newest first`,
    `- [Acta's public roadmap](${at(actaRoadmapHref)}): what's planned and under way`,
    `- [Demo board](${at("/demo")}): the real app, saved in the browser, no account needed`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
