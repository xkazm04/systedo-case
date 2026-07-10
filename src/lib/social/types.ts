/** Social command-center domain model — framework-free (no I/O, no firebase),
 *  shared by the connector, store, API routes and UI. */
import { TONES, TONE_LABELS, type Tone } from "@/lib/ai-types";

export { TONES, TONE_LABELS };
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
export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed";

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  draft: "Koncept",
  scheduled: "Naplánováno",
  publishing: "Zveřejňuje se…",
  published: "Zveřejněno",
  failed: "Chyba",
};

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
  publishedAt?: string;
  createdAt: string;
  /** URL of the published post (or a demo marker) */
  externalUrl?: string;
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
