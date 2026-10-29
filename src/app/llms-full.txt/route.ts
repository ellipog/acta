import { docPages, docUrl } from "@/lib/docs";

// Every page of Acta's docs in one Markdown file, for AI tools to read at once
export function GET() {
  const body = [
    "# Acta docs",
    "",
    "> A project manager for small teams and the AI agents that work with them.",
    "",
    ...docPages.flatMap((d) => [`# ${d.title}`, "", `Source: ${docUrl(d.slug)}`, "", d.body, ""]),
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
