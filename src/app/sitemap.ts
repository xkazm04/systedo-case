import type { MetadataRoute } from "next";
import { article } from "@/lib/article";
import { sitemapEntries } from "@/lib/nav";
import { canonical } from "@/lib/site";

/** Sitemap derived from the single nav model (+ meta pages), so it never drifts
 *  from what actually ships. The article route additionally carries
 *  `lastModified` from the content's own freshness field — the recrawl hint
 *  `meta.dateModifiedISO` was added to power (the nav-derived entries have no
 *  meaningful modification date, so they stay untouched). */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries().map((path) => ({
    url: canonical(path),
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.7,
    ...(path === "/clanek"
      ? { lastModified: article.meta.dateModifiedISO ?? article.meta.dateISO }
      : {}),
  }));
}
