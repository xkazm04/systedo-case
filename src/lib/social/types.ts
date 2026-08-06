/** Social command-center domain model — framework-free (no I/O, no firebase),
 *  shared by the connector, store, API routes and UI. */
import { TONES, TONE_LABELS, toneLabel, type Tone } from "@/lib/ai-types";
import type { SupportedLocale } from "@/lib/format";

export { TONES, TONE_LABELS, toneLabel };
export type { Tone };

export const SOCIAL_PLATFORMS = ["facebook", "instagram", "linkedin", "tiktok"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
};

/** Practical caption character limits per platform. */
export const PLATFORM_LIMITS: Record<SocialPlatform, number> = {
  facebook: 2200,
  instagram: 2200,
  linkedin: 3000,
  tiktok: 2200,
};

export function isSocialPlatform(v: unknown): v is SocialPlatform {
  return typeof v === "string" && (SOCIAL_PLATFORMS as readonly string[]).includes(v);
}

// "publishing" is a transient claim state: the publish cron flips a due post
// scheduled→publishing atomically before calling the provider, so overlapping runs
// can't both publish it. It settles to published/failed once the provider returns.
// The claim is LEASED, not permanent: `claimedAt` is stamped when it is taken, and
// a claim older than PUBLISH_CLAIM_TTL_MS (the claimer crashed/timed out mid-
// publish) is settled to "failed" by the cron's stale-claim sweep — never left in
// limbo the UI has no terminal meaning for.
export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed";

/** How long a "publishing" claim may sit before the next cron run may treat it as
 *  STRANDED (the claimer crashed before the status settled) and fail it out.
 *  2× the cron route's maxDuration (300 s) — comfortably longer than any live
 *  publish, short enough that a stranded post surfaces within minutes. */
export const PUBLISH_CLAIM_TTL_MS = 10 * 60 * 1000;

/** Whether a "publishing" claim taken at `claimedAt` is old enough to be treated
 *  as stranded. A missing or unparseable stamp counts as stale — a legacy claim we
 *  can't date is one we must be able to recover, never one stuck forever. */
export function isStalePublishClaim(
  claimedAt: string | undefined,
  now: number,
  ttlMs = PUBLISH_CLAIM_TTL_MS
): boolean {
  if (!claimedAt) return true;
  const at = Date.parse(claimedAt);
  if (Number.isNaN(at)) return true;
  return now - at >= ttlMs;
}

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  draft: "Koncept",
  scheduled: "Naplánováno",
  // `Publikuje se…`, not `Zveřejňuje se…`: A16 put the *state* axis on
  // `publikovat` while the user-facing *verb* stays `zveřejnit`
  // (`Composer.publishNow`). A status enum is the state axis, so mixing roots
  // inside one lifecycle (`Zveřejňuje se… → Publikováno`) was drift.
  publishing: "Publikuje se…",
  published: "Publikováno",
  failed: "Chyba",
};

export const POST_STATUS_LABELS_EN: Record<PostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing…",
  published: "Published",
  failed: "Failed",
};

/** The status-pill label for the reader's locale (PostsList). The KEY is the
 *  persisted `PostStatus`; only the label is copy. */
export function postStatusLabel(s: PostStatus, locale: SupportedLocale): string {
  return (locale === "en" ? POST_STATUS_LABELS_EN : POST_STATUS_LABELS)[s];
}

export interface SocialAccount {
  platform: SocialPlatform;
  /** handle / page name */
  handle: string;
  connectedAt: string;
  /** true for the demo connection (no real OAuth) */
  demo: boolean;
}

export interface SocialPost {
  id: string;
  platform: SocialPlatform;
  content: string;
  status: PostStatus;
  /** ISO time the post is scheduled to publish (scheduled status) */
  scheduledAt?: string;
  /** ISO time the current "publishing" claim was taken (stamped by the atomic
   *  scheduled→publishing claim). Lets the stale-claim sweep tell a live publish
   *  from a stranded one; absent on posts never claimed or claimed before the
   *  lease existed (treated as stale → recoverable). */
  claimedAt?: string;
  publishedAt?: string;
  createdAt: string;
  /** URL of the published post (a real permalink, or a demo.social preview marker) */
  externalUrl?: string;
  /** true when the publish was SIMULATED (no real provider configured/connected) — the
   *  UI labels it honestly instead of dressing the demo.social URL up as a real post.
   *  Absent on legacy/pre-seam records; the UI still falls back to sniffing the URL. */
  simulated?: boolean;
  error?: string;
}

export interface SocialMessage {
  id: string;
  platform: SocialPlatform;
  author: string;
  text: string;
  kind: "comment" | "dm";
  receivedAt: string;
  status: "open" | "replied";
  reply?: string;
}

/** One drafted caption (template or AI) for a platform. */
export interface SocialDraftPost {
  platform: SocialPlatform;
  content: string;
}

/** Result of the social drafting tool — one post per requested platform. */
export interface SocialDraftResult {
  posts: SocialDraftPost[];
}
