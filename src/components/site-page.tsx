import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Eyebrow } from "@/components/ui/display";
import { cn } from "@/lib/utils";

export type SideLink = { href: string; label: string; current?: boolean };

/** A page of the marketing site with a side column of links: docs, comparisons and the changelog */
export function SitePage({
  eyebrow,
  title,
  intro,
  side,
  sideLabel,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: React.ReactNode;
  side?: { label: string; links: SideLink[] }[];
  sideLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-12 px-4 py-12 sm:px-6">
        {side?.length ? (
          <nav aria-label={sideLabel ?? eyebrow} className="sticky top-20 hidden h-fit w-52 shrink-0 text-sm lg:block">
            {side.map((group) => (
              <div key={group.label} className="mb-6">
                <p className="mb-2 font-mono text-[10px] tracking-[0.14em] text-ink-3 uppercase">{group.label}</p>
                {group.links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={l.current ? "page" : undefined}
                    className={cn(
                      "block border-l py-1 pl-3 hover:border-lapis hover:text-ink",
                      l.current ? "border-lapis text-ink" : "border-line text-ink-2",
                    )}
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        ) : null}
        <main className="min-w-0 max-w-2xl flex-1">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-3 font-display text-5xl">{title}</h1>
          {intro ? <div className="mt-6 text-lg leading-relaxed text-ink-2">{intro}</div> : null}
          {children}
        </main>
      </div>
      <SiteFooter />
    </>
  );
}

/** A titled part of a page, with an anchor */
export function PageSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-20">
      <h2 className="font-display text-2xl">
        <a href={`#${id}`} className="hover:text-lapis">
          {title}
        </a>
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
