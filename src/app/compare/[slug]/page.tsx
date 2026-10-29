import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageSection, SitePage } from "@/components/site-page";
import { checked, comparisons } from "@/lib/compare";

export function generateStaticParams() {
  return comparisons.map((c) => ({ slug: c.slug }));
}

const find = (slug: string) => comparisons.find((c) => c.slug === slug);

export async function generateMetadata({ params }: PageProps<"/compare/[slug]">): Promise<Metadata> {
  const c = find((await params).slug);
  if (!c) return { title: "Not found", robots: { index: false } };
  return {
    title: `${c.title}: which to pick`,
    description: c.description,
    alternates: { canonical: `/compare/${c.slug}` },
    openGraph: { title: c.title, description: c.description, type: "article" },
  };
}

function Picks({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2 text-[15px] text-ink-2">
      {items.map((p) => (
        <li key={p} className="flex gap-2.5">
          <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 bg-lapis" />
          {p}
        </li>
      ))}
    </ul>
  );
}

export default async function ComparisonPage({ params }: PageProps<"/compare/[slug]">) {
  const c = find((await params).slug);
  if (!c) notFound();
  return (
    <SitePage
      eyebrow="Compare"
      title={c.title}
      intro={<p>{c.intro}</p>}
      side={[
        {
          label: "Compare",
          links: comparisons.map((o) => ({ href: `/compare/${o.slug}`, label: `vs ${o.name}`, current: o === c })),
        },
      ]}
    >
      <PageSection id="side-by-side" title="Side by side">
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead className="bg-sunken font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              <tr>
                <td className="px-3 py-2" />
                <th className="px-3 py-2 font-normal">Acta</th>
                <th className="px-3 py-2 font-normal">{c.name}</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map(([what, acta, them]) => (
                <tr key={what} className="border-t border-line align-top">
                  <th scope="row" className="px-3 py-2.5 font-medium text-ink">
                    {what}
                  </th>
                  <td className="px-3 py-2.5 text-ink-2">{acta}</td>
                  <td className="px-3 py-2.5 text-ink-2">{them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 font-mono text-xs text-ink-3">
          {c.name} as it comes, without add-ons. Checked {checked}; tools change, so check theirs too.
        </p>
      </PageSection>
      <PageSection id="pick-them" title={`When ${c.name} is the better pick`}>
        <Picks items={c.pickThem} />
      </PageSection>
      <PageSection id="pick-acta" title="When Acta is the better pick">
        <Picks items={c.pickActa} />
      </PageSection>
      <div className="mt-12 flex flex-wrap gap-3">
        <Button asChild variant="primary">
          <Link href="/demo">Try the demo board</Link>
        </Button>
        <Button asChild>
          <Link href="/docs/getting-started">Read the docs</Link>
        </Button>
      </div>
    </SitePage>
  );
}
