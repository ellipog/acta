import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/components/site-page";
import { docPages } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Docs",
  description: "How to use Acta: boards and tasks, AI agents over MCP, the HTTP API, GitHub and public roadmaps.",
  alternates: { canonical: "/docs" },
};

export default function DocsPage() {
  return (
    <SitePage
      eyebrow="Docs"
      title="Acta docs"
      intro={<p>How to run your work in Acta, and how to let agents, scripts and GitHub work on it with you.</p>}
    >
      <ul className="mt-10 flex flex-col border-t border-line">
        {docPages.map((d) => (
          <li key={d.slug} className="border-b border-line">
            <Link href={`/docs/${d.slug}`} className="group block py-5">
              <span className="font-display text-2xl group-hover:text-lapis">{d.title}</span>
              <span className="mt-1 block text-ink-2">{d.description}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-ink-3">
        For AI tools, the same docs are at <Link href="/llms-full.txt" className="underline underline-offset-2 hover:text-ink">/llms-full.txt</Link>.
      </p>
    </SitePage>
  );
}
