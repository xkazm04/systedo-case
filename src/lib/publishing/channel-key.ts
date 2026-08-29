/** The ONE channel vocabulary the publishing calendar speaks.
 *
 *  Four schedulers plan onto the same real-world channels through four different
 *  id spaces that nothing ever joined: `SocialPlatform` (social/types.ts),
 *  `TwinChannel` (twin/types.ts), `OrganicChannel.id` slugs
 *  (organic-channels/sample.ts) and the Distribuce channel LABELS
 *  (distribution/generate.ts). So "Instagram" was four unrelated strings, and the
 *  kanály cadence cap — written per organic slug — could not be counted against
 *  anything the other three wrote.
 *
 *  `ChannelKey` is that join. It is deliberately a READ-SIDE canonical key: no
 *  store persists it, nothing migrates onto it, and every mapper below is a pure
 *  function from an existing vocabulary INTO it. Adding a channel here can never
 *  change what any store holds.
 *
 *  UNMAPPED IS "other", AND "other" NEVER CARRIES A CAP. Most organic channels
 *  (Heureka, Firmy.cz, Reddit, Product Hunt…) have no publishing surface in this
 *  app at all. Collapsing them onto one key and then enforcing a cap on it would
 *  refuse a LinkedIn post because someone capped a directory listing — so
 *  `cadenceRules` drops "other" rules outright (see ./cadence). Pure and
 *  framework-free: the client calendar and the server route import the same file. */
import type { SocialPlatform } from "@/lib/social/types";

export const CHANNEL_KEYS = [
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "x",
  "newsletter",
  "gbp",
  "blog",
  "youtube",
  "pinterest",
  "other",
] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

export function isChannelKey(v: unknown): v is ChannelKey {
  return typeof v === "string" && (CHANNEL_KEYS as readonly string[]).includes(v);
}

/** Display names — brand names, so they are the same in cs and en (the surrounding
 *  copy is localized; a channel's own name is not translated). */
export const CHANNEL_KEY_LABELS: Record<ChannelKey, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  x: "X / Twitter",
  newsletter: "Newsletter",
  gbp: "Google Business Profile",
  blog: "Blog",
  youtube: "YouTube",
  pinterest: "Pinterest",
  other: "—",
};

/** Lowercase, every run of non-alphanumerics folded to a single "-". Turns
 *  "X / Twitter", "google-business-profile" and "Facebook skupiny" into one shape
 *  the matchers below can reason about. */
function normalize(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Multi-token phrases, checked BEFORE single tokens: "google-business-profile"
 *  must not fall through to a bare-token match, and "x-twitter" must resolve
 *  before the (deliberately broad) "x" token below. */
const PHRASES: readonly (readonly [ChannelKey, string])[] = [
  ["gbp", "google-business-profile"],
  ["gbp", "google-business"],
  ["gbp", "google-firemni-profil"],
  ["x", "x-twitter"],
];

/** Single tokens, in priority order. "x" sits LAST because it is one character
 *  and would otherwise swallow any slug that happens to contain it. */
const TOKENS: readonly (readonly [ChannelKey, readonly string[]])[] = [
  ["facebook", ["facebook", "fb"]],
  ["instagram", ["instagram", "ig"]],
  ["linkedin", ["linkedin"]],
  ["tiktok", ["tiktok"]],
  ["newsletter", ["newsletter"]],
  ["gbp", ["gbp"]],
  ["blog", ["blog"]],
  ["youtube", ["youtube"]],
  ["pinterest", ["pinterest"]],
  ["x", ["twitter", "x"]],
];

/** The shared matcher: any human-or-slug channel name → a ChannelKey, "other"
 *  when nothing matches. Used by every mapper below so a slug, a Distribuce label
 *  and an AI-invented channel name all resolve through ONE rule. */
export function channelKeyFromLabel(label: string): ChannelKey {
  const slug = normalize(label);
  if (!slug) return "other";
  for (const [key, phrase] of PHRASES) {
    if (slug.includes(phrase)) return key;
  }
  const parts = slug.split("-");
  for (const [key, tokens] of TOKENS) {
    if (tokens.some((t) => parts.includes(t))) return key;
  }
  return "other";
}

/** The four social platforms are already canonical — identity, not a lookup, so a
 *  new SocialPlatform is a compile error here rather than a silent "other". */
export function channelKeyFromPlatform(p: SocialPlatform): ChannelKey {
  return p;
}

/** An `OrganicChannel.id` slug ("instagram-organic", "facebook-skupiny",
 *  "google-business-profile") → its channel. A PINNED AI plan mints ids like
 *  `kanal-3` (sanitizeChannel's fallback), which carry no channel information at
 *  all — that is why `cadenceRules` retries through the channel's NAME. */
export function channelKeyFromOrganicId(id: string): ChannelKey {
  return channelKeyFromLabel(id);
}

/** A Distribuce channel LABEL ("X / Twitter", "Newsletter", "LinkedIn"). The
 *  labels are the storage key over in distribution/variants, so this is the only
 *  join available there. */
export function channelKeyFromRepurpose(label: string): ChannelKey {
  return channelKeyFromLabel(label);
}

/** A content-plan slot's channel: the platform it was handed to, when it was
 *  handed to one. A slot that has NOT been handed over has no channel — the board
 *  is explicit that nothing has left the app and that it does not post to Google
 *  Business Profile (content-schedule/sample.ts header), so guessing "gbp" here
 *  would manufacture exactly the claim that module removed. Unhanded → "other". */
export function channelKeyFromContentChannel(platform: SocialPlatform | undefined | null): ChannelKey {
  return platform ? channelKeyFromPlatform(platform) : "other";
}
