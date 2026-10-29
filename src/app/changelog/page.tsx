import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { SitePage } from "@/components/site-page";
import { isPrivate, type PublicTask } from "@/lib/public-roadmap";
import { actaBoard, excerpt, publicRoadmap, shippedOn } from "@/lib/seo";
import { actaRoadmapHref, siteUrl } from "@/lib/slugs";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Everything shipped in Acta, newest first, straight from the board Acta is planned on.",
  alternates: { canonical: "/changelog", types: { "application/rss+xml": "/changelog/rss.xml" } },
};

// The Monday a day falls in the week of, as YYYY-MM-DD
function weekOf(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const long = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dayOf = (day: string) => long.format(new Date(`${day}T12:00:00Z`));

export default async function ChangelogPage() {
  const roadmap = await publicRoadmap(...actaBoard);
  const shipped = roadmap && !isPrivate(roadmap) ? shippedOn(roadmap) : [];
  const prefix = roadmap && !isPrivate(roadmap) ? roadmap.board.prefix : "ACT";
  const weeks = new Map<string, PublicTask[]>();
  for (const t of shipped) {
    const week = weekOf(t.shipped_on!);
    weeks.set(week, [...(weeks.get(week) ?? []), t]);
  }
  return (
    <SitePage
      eyebrow="Changelog"
      title="What’s new in Acta"
      intro={
        <p>
          Everything shipped, newest first, straight from{" "}
          <Link href={actaRoadmapHref} className="underline underline-offset-2 hover:text-ink">
            the board Acta is planned on
          </Link>
          . Follow along with the{" "}
          <a href="/changelog/rss.xml" className="underline underline-offset-2 hover:text-ink">
            RSS feed
          </a>
          .
        </p>
      }
    >
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Acta changelog",
          url: `${siteUrl}/changelog`,
          itemListElement: shipped.slice(0, 50).map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.title })),
        }}
      />
      {weeks.size ? (
        [...weeks].map(([week, tasks]) => (
          <section key={week} id={`week-${week}`} className="mt-12 scroll-mt-20">
            <h2 className="font-display text-2xl">
              <a href={`#week-${week}`} className="hover:text-lapis">
                Week of <time dateTime={week}>{dayOf(week)}</time>
              </a>
            </h2>
            <ul className="mt-4 flex flex-col border-t border-line">
              {tasks.map((t) => {
                const summary = excerpt(t.description, 220);
                return (
                  <li key={t.number} className="flex gap-4 border-b border-line py-4">
                    <span className="w-16 shrink-0 pt-0.5 font-mono text-xs text-ink-3">
                      {prefix}-{t.number}
                    </span>
                    <div className="min-w-0">
                      <p className="text-ink">{t.title}</p>
                      {summary ? <p className="mt-1 text-sm text-ink-2">{summary}</p> : null}
                      <time dateTime={t.shipped_on!} className="mt-1 block font-mono text-[11px] text-ink-3">
                        {dayOf(t.shipped_on!)}
                      </time>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      ) : (
        <p className="mt-10 text-ink-2">Nothing here yet.</p>
      )}
    </SitePage>
  );
}
