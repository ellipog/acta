import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/slugs";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
