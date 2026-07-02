import type { MetadataRoute } from "next";
import { canonical } from "@/lib/site";

/** robots.txt route, mirroring the env-driven indexing policy already declared
 *  as metadata in the root layout (same VERCEL_ENV === "production" toggle):
 *  the canonical production deploy is crawlable (minus the authed /app
 *  workspace and the API surface) and advertises the nav-model-derived
 *  sitemap; preview deploys and local runs are crawl-blocked outright, so
 *  crawlers stop BEFORE fetching pages instead of discovering the noindex meta
 *  tag one URL at a time. */

/** Pure policy builder (exported for unit tests). */
export function robotsPolicy(isProduction: boolean): MetadataRoute.Robots {
  if (!isProduction) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/api"] },
    sitemap: canonical("/sitemap.xml"),
  };
}

export default function robots(): MetadataRoute.Robots {
  return robotsPolicy(process.env.VERCEL_ENV === "production");
}
