import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { PageSection, SitePage } from "@/components/site-page";
import { Markdown } from "@/components/ui/markdown";
import { docPages, docUrl, sections } from "@/lib/docs";
import { siteUrl } from "@/lib/slugs";

export function generateStaticParams() {
  return docPages.map((d) => ({ slug: d.slug }));
}

const find = (slug: string) => docPages.find((d) => d.slug === slug);

export async function generateMetadata({ params }: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const doc = find((await params).slug);
  if (!doc) return { title: "Not found", robots: { index: false } };
  return {
    title: doc.title,
    description: doc.description,
    alternates: { canonical: `/docs/${doc.slug}` },
    openGraph: { title: doc.title, description: doc.description, url: docUrl(doc.slug), type: "article" },
  };
}

// Links within the site open in place rather than in a new tab
const local = (markdown: string) => markdown.replaceAll(`](${siteUrl}`, "](");

export default async function DocPage({ params }: PageProps<"/docs/[slug]">) {
  const doc = find((await params).slug);
  if (!doc) notFound();
  const { intro, sections: parts } = sections(doc.body);
  const at = docPages.indexOf(doc);
  const next = docPages[at + 1];
  return (
    <SitePage
      eyebrow="Docs"
      title={doc.title}
      side={[
        { label: "Docs", links: docPages.map((d) => ({ href: `/docs/${d.slug}`, label: d.nav, current: d === doc })) },
        { label: "On this page", links: parts.map((s) => ({ href: `#${s.id}`, label: s.title })) },
      ]}
    >
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: doc.title,
          description: doc.description,
          url: docUrl(doc.slug),
          publisher: { "@type": "Organization", name: "Aaen Studios", url: siteUrl },
        }}
      />
      <Markdown source={local(intro)} className="mt-6 text-base" />
      {parts.map((s) => (
        <PageSection key={s.id} id={s.id} title={s.title}>
          <Markdown source={local(s.body)} className="text-[15px]" />
        </PageSection>
      ))}
      {next ? (
        <Link href={`/docs/${next.slug}`} className="group mt-16 block border border-line p-5 hover:border-lapis">
          <span className="font-mono text-[10px] tracking-[0.14em] text-ink-3 uppercase">Next</span>
          <span className="mt-1 block font-display text-xl group-hover:text-lapis">{next.title}</span>
        </Link>
      ) : null}
    </SitePage>
  );
}
