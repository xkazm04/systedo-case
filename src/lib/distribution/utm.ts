/** UTM stamping for distributed variant links, so everything the user ships is
 *  attributable in the dashboard's analytics story. Mirrors the article ShareBar's
 *  withUtm() shape: each channel keeps its own utm_source, while utm_medium and
 *  utm_campaign are the shared "campaign tag". Pure — no DOM, no I/O. */
import { slugify } from "@/lib/nav";

/** Shared medium for everything that originates from the distribution module. */
export const UTM_MEDIUM = "distribution";

export interface UtmParams {
  source: string;
  medium: string;
  campaign: string;
}

/** Distribuce channel label → its utm_source slug. Keys mirror the variant
 *  channels exactly so the surfaced links visibly correspond to the channels. */
const CHANNEL_UTM_SOURCE: Record<string, string> = {
  Newsletter: "newsletter",
  LinkedIn: "linkedin",
  Instagram: "instagram",
  "X / Twitter": "twitter",
  Facebook: "facebook",
};

/** Maps a channel label to its utm_source. Unknown channels fall back to a
 *  diacritics-safe slug of the label so the link is still tagged (never blank). */
export function channelUtmSource(channel: string): string {
  return CHANNEL_UTM_SOURCE[channel] ?? (slugify(channel) || "distribution");
}

/** Append the three UTM params to a URL, preserving any existing query string
 *  (joins with `&`) and fragment. Setting params is idempotent — re-stamping a
 *  link overwrites stale utm_* rather than duplicating them. */
export function withUtm(url: string, { source, medium, campaign }: UtmParams): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}

/** Campaign slug derived from the article — prefer the title, fall back to the
 *  last URL path segment, then to a stable default so the campaign is never empty. */
export function campaignSlug({ title, url }: { title: string; url: string }): string {
  const fromTitle = slugify(title);
  if (fromTitle) return fromTitle;
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    const fromUrl = slugify(last);
    if (fromUrl) return fromUrl;
  } catch {
    /* malformed URL — fall through to the default */
  }
  return "clanek";
}

/** The public path of a minted, MEASURABLE short link (WP W2-A).
 *
 *  Deliberately short and UTM-free: the whole point of the hop is that the tenant
 *  copies `/go/{id}` into a bio, a forum post or a directory listing — places where
 *  a 120-character UTM tail is either ugly, truncated or stripped — and the redirect
 *  composes `withUtm` server-side, so the destination still sees the same
 *  utm_source/medium/campaign it would have seen from a directly stamped link. */
export function goHref(id: string): string {
  return `/go/${id}`;
}

/** Strip the three UTM params this module stamps, recovering the link's real
 *  destination. Used when a UTM'd link is all a caller has and the raw target is
 *  what must be stored (the mint path) — re-stamping happens at the redirect, so
 *  storing an already-stamped URL would double the tail. */
export function withoutUtm(url: string): string {
  try {
    const u = new URL(url);
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) u.searchParams.delete(key);
    return u.toString();
  } catch {
    return url;
  }
}

/** Convenience: the fully-stamped link for one channel of one article. */
export function variantLink(
  url: string,
  channel: string,
  campaign: string,
): string {
  return withUtm(url, {
    source: channelUtmSource(channel),
    medium: UTM_MEDIUM,
    campaign,
  });
}
