import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/components/site-page";
import { checked, comparisons } from "@/lib/compare";
import { useCases } from "@/lib/use-cases";

export const metadata: Metadata = {
  title: "Compare Acta",
  description: "How Acta compares with Linear, Trello, Jira and GitHub Projects, and when each is the better pick.",
  alternates: { canonical: "/compare" },
};

export default function ComparePage() {
  return (
    <SitePage
      eyebrow="Compare"
      title="How Acta compares"
      intro={<p>Acta next to the tools people move from, including when to pick the other one.</p>}
    >
      <ul className="mt-10 flex flex-col border-t border-line">
        {comparisons.map((c) => (
          <li key={c.slug} className="border-b border-line">
            <Link href={`/compare/${c.slug}`} className="group block py-5">
              <span className="font-display text-2xl group-hover:text-lapis">{c.title}</span>
              <span className="mt-1 block text-ink-2">{c.description}</span>
            </Link>
          </li>
        ))}
      </ul>
      <h2 className="mt-14 font-display text-2xl">What teams use Acta for</h2>
      <ul className="mt-4 flex flex-col gap-2">
        {useCases.map((u) => (
          <li key={u.slug}>
            <Link
              href={`/use-cases/${u.slug}`}
              className="text-lapis underline decoration-lapis/40 underline-offset-2 hover:decoration-lapis"
            >
              {u.title}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-10 font-mono text-xs text-ink-3">Checked {checked}.</p>
    </SitePage>
  );
}
