import type { MetadataRoute } from "next";
import { compareSlugs } from "@/lib/compare";
import { docPages } from "@/lib/docs";
import { listedRoadmaps, roadmapUrl } from "@/lib/seo";
import { siteUrl } from "@/lib/slugs";
import { useCaseSlugs } from "@/lib/use-cases";

// Acta's own pages, then every published roadmap that has something on it and isn't hidden from search engines.
// Roadmaps are listed at their own domain when there is one, matching their canonical address
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const at = (path: string) => new URL(path, siteUrl).href;
  const roadmaps = await listedRoadmaps();
  return [
    { url: at("/"), changeFrequency: "weekly", priority: 1 },
    { url: at("/demo"), changeFrequency: "monthly", priority: 0.8 },
    { url: at("/docs"), changeFrequency: "weekly", priority: 0.8 },
    ...docPages.map((d) => ({ url: at(`/docs/${d.slug}`), changeFrequency: "weekly" as const, priority: 0.7 })),
    { url: at("/changelog"), changeFrequency: "daily", priority: 0.6 },
    { url: at("/compare"), changeFrequency: "monthly", priority: 0.5 },
    ...compareSlugs.map((slug) => ({ url: at(`/compare/${slug}`), changeFrequency: "monthly" as const, priority: 0.5 })),
    ...useCaseSlugs.map((slug) => ({ url: at(`/use-cases/${slug}`), changeFrequency: "monthly" as const, priority: 0.5 })),
    { url: at("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    { url: at("/terms"), changeFrequency: "yearly", priority: 0.2 },
    ...roadmaps.map((r) => ({
      url: roadmapUrl(r.workspace, r.board),
      lastModified: r.updated,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
