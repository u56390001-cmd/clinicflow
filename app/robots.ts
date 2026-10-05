import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/constants";

/**
 * Robots policy.
 *
 * Everything under `/app` is the authenticated dashboard and must never be
 * crawled. The dashboard is the only place patient-identifiable data lives, so
 * disallowing it also keeps clinic records out of search indexes.
 *
 * `/site` and `/widget` are deliberately allowed — those are the public pages a
 * clinic wants found.
 */
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/site/", "/widget/"],
        disallow: [
          "/app/",
          "/api/",
          // Query strings on the public site are never canonical content.
          "/*?*",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}