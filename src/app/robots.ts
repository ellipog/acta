import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { publicHost, siteUrl } from "@/lib/slugs";

// The roadmap domain, when there is one, only serves roadmaps, and points at Acta's sitemap, which lists them by
// their address there
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host")?.split(":")[0];
  if (publicHost && (host === publicHost || host === `www.${publicHost}`))
    return { rules: { userAgent: "*", allow: "/" }, sitemap: `${siteUrl}/sitemap.xml` };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
