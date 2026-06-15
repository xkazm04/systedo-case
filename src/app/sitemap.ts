import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/nav";
import { canonical } from "@/lib/site";

/** Sitemap derived from the single nav model (+ meta pages), so it never drifts
 *  from what actually ships. */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries().map((path) => ({
    url: canonical(path),
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
