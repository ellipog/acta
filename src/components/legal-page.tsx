import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Eyebrow } from "@/components/ui/display";
import { legalUpdated } from "@/lib/legal";

export type LegalSection = { id: string; title: string; body: React.ReactNode };

export function Fill({ value }: { value: string }) {
  if (!value.startsWith("[")) return <>{value}</>;
  return <mark className="bg-pyrite-soft px-1 text-pyrite-ink">{value}</mark>;
}

export function LegalPage({
  title,
  intro,
  summary,
  sections,
}: {
  title: string;
  intro: React.ReactNode;
  summary: string[];
  sections: LegalSection[];
}) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-12 px-4 py-12 sm:px-6">
        <nav aria-label="On this page" className="sticky top-20 hidden h-fit w-52 shrink-0 text-sm lg:block">
          <p className="mb-2 font-mono text-[10px] tracking-[0.14em] text-ink-3 uppercase">On this page</p>
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="block border-l border-line py-1 pl-3 text-ink-2 hover:border-lapis hover:text-ink"
            >
              {s.title}
            </a>
          ))}
          <p className="mt-6 text-xs text-ink-3">
            See also{" "}
            <Link
              href={title === "Privacy policy" ? "/terms" : "/privacy"}
              className="underline underline-offset-2 hover:text-ink"
            >
              {title === "Privacy policy" ? "the terms" : "the privacy policy"}
            </Link>
            .
          </p>
        </nav>
        <main className="min-w-0 max-w-2xl flex-1">
          <Eyebrow>Legal</Eyebrow>
          <h1 className="mt-3 font-display text-5xl">{title}</h1>
          <p className="mt-3 font-mono text-xs text-ink-3">Last updated {legalUpdated}</p>
          <div className="mt-6 text-ink-2">{intro}</div>
          <aside className="mt-8 border border-ink bg-raised p-5">
            <p className="font-mono text-[11px] tracking-[0.12em] text-ink-3 uppercase">The short version</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {summary.map((s) => (
                <li key={s} className="flex gap-2.5">
                  <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 bg-lapis" />
                  {s}
                </li>
              ))}
            </ul>
          </aside>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="mt-12 scroll-mt-20">
              <h2 className="font-display text-2xl">
                <span className="mr-2 font-mono text-sm text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </h2>
              <div className="legal mt-4 flex flex-col gap-4 text-[15px] leading-relaxed text-ink-2">{s.body}</div>
            </section>
          ))}
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
