import type { MetadataRoute } from "next";
import { actaRoadmapHref, siteUrl } from "@/lib/slugs";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/demo", actaRoadmapHref, "/privacy", "/terms"].map((path) => ({ url: new URL(path, siteUrl).href }));
}
