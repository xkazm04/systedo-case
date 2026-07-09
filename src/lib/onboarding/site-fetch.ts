/** Fetch a project's own homepage and reduce it to plain text for the
 *  `onboarding-scan` op. Reuses the SSRF-guarded fetch behind the catalog feed
 *  importer (scheme allow-list, private-IP BlockList, DNS-rebinding guard, redirect
 *  re-validation, size + time caps) — the same threat model, since it's again an
 *  authed owner supplying a URL. Server-only; built-ins only. */
import "server-only";
import { fetchFeed, FeedFetchError } from "@/lib/catalog/feed-fetch";

export { FeedFetchError };

export interface SiteText {
  title: string;
  description: string;
  /** the visible page text, tag-stripped, whitespace-collapsed and length-capped */
  text: string;
}

/** Add a scheme when the user typed a bare domain ("mionelo.cz"). */
export function normalizeSiteUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** Decode the handful of HTML entities that survive tag-stripping and matter for
 *  readable prose. Numeric entities are decoded generically. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => {
      const code = Number(d);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    });
}

const firstMatch = (html: string, ...res: RegExp[]): string => {
  for (const re of res) {
    const m = re.exec(html);
    if (m?.[1]) return decodeEntities(m[1]).trim();
  }
  return "";
};

/** Reduce raw HTML to a title, meta description and a bounded plain-text body. Pure
 *  (exported for unit testing) — no network. */
export function extractSiteText(html: string): SiteText {
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i).slice(0, 200);
  const description = firstMatch(
    html,
    /<meta[^>]+name=["']description["'][^>]*content=["']([\s\S]*?)["']/i,
    /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["']/i,
    /<meta[^>]+property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i
  ).slice(0, 400);

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(body).replace(/\s+/g, " ").trim().slice(0, 8000);

  return { title, description, text };
}

/** Fetch the homepage and extract its text. Throws FeedFetchError on any guard or
 *  network failure — the route surfaces the message. */
export async function fetchSiteText(rawUrl: string): Promise<SiteText> {
  const html = await fetchFeed(normalizeSiteUrl(rawUrl));
  return extractSiteText(html);
}
