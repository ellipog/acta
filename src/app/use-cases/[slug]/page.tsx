import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageSection, SitePage } from "@/components/site-page";
import { Markdown } from "@/components/ui/markdown";
import { sections } from "@/lib/docs";
import { siteUrl } from "@/lib/slugs";
import { useCases } from "@/lib/use-cases";

export function generateStaticParams() {
  return useCases.map((u) => ({ slug: u.slug }));
}

const find = (slug: string) => useCases.find((u) => u.slug === slug);

export async function generateMetadata({ params }: PageProps<"/use-cases/[slug]">): Promise<Metadata> {
  const u = find((await params).slug);
  if (!u) return { title: "Not found", robots: { index: false } };
  return {
    title: u.title,
    description: u.description,
    alternates: { canonical: `/use-cases/${u.slug}` },
    openGraph: { title: u.title, description: u.description, type: "article" },
  };
}

// Links within the site open in place rather than in a new tab
const local = (markdown: string) => markdown.replaceAll(`](${siteUrl}`, "](");

export default async function UseCasePage({ params }: PageProps<"/use-cases/[slug]">) {
  const u = find((await params).slug);
  if (!u) notFound();
  return (
    <SitePage
      eyebrow="Use Acta for"
      title={u.title}
      intro={<p>{u.intro}</p>}
      side={[
        {
          label: "Use Acta for",
          links: useCases.map((o) => ({ href: `/use-cases/${o.slug}`, label: o.nav, current: o === u })),
        },
      ]}
    >
      {sections(u.body).sections.map((s) => (
        <PageSection key={s.id} id={s.id} title={s.title}>
          <Markdown source={local(s.body)} className="text-[15px]" />
        </PageSection>
      ))}
      <div className="mt-12 flex flex-wrap gap-3">
        <Button asChild variant="primary">
          <Link href="/demo">Try the demo board</Link>
        </Button>
        <Button asChild>
          <Link href="/compare">Compare Acta</Link>
        </Button>
      </div>
    </SitePage>
  );
}
