import type { MetadataRoute } from "next";
import { article } from "@/lib/article";
import { categoryHubPath, sitemapEntries } from "@/lib/nav";
import { canonical } from "@/lib/site";

/** Sitemap derived from the single nav model (+ meta pages), so it never drifts
 *  from what actually ships. The article route additionally carries `lastModified`
 *  from the content's own freshness field — the recrawl hint that
 *  `meta.dateModifiedISO` was added to power (the nav-derived entries have no
 *  meaningful modification date, so they stay untouched).
 *
 *  `priority` and `changeFrequency` are conventional defaults (home 1.0, every
 *  other page 0.7; monthly) — search engines largely ignore both, so they satisfy
 *  the schema rather than encode a real crawl policy. The article path comes from
 *  the nav SSOT (categoryHubPath) so it can't silently stop matching if /clanek is
 *  ever renamed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const articlePath = categoryHubPath();
  return sitemapEntries().map((path) => ({
    url: canonical(path),
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.7,
    ...(path === articlePath
      ? { lastModified: article.meta.dateModifiedISO ?? article.meta.dateISO }
      : {}),
  }));
}
