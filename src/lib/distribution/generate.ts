/** Deterministic one-to-many repurposing: a source article → channel-native
 *  variants respecting each platform's length. Pure, no LLM. Every variant's
 *  link is UTM-stamped per channel so what the user ships is attributable. Seam:
 *  the AI tools (/api/ai, social) for richer, on-brand variants. */
import type { SourceArticle } from "./sample";
import { campaignSlug, variantLink } from "./utm";

export interface Repurposed {
  channel: string;
  text: string;
  /** soft character budget for the channel */
  max: number;
  /** the article URL stamped with this channel's UTM tags */
  link: string;
}

/** Soft per-channel character budgets, shared by the deterministic repurpose()
 *  output and the AI repurpose tool so both honour the same limits. The order
 *  here is the order variants render in. */
export const CHANNEL_LIMITS = {
  Newsletter: 600,
  LinkedIn: 3000,
  Instagram: 2200,
  "X / Twitter": 280,
} as const;

/** The channels the distribution module repurposes into, in render order. */
export type RepurposeChannel = keyof typeof CHANNEL_LIMITS;
export const REPURPOSE_CHANNELS = Object.keys(CHANNEL_LIMITS) as RepurposeChannel[];

/** Clip `s` to at most `max` characters on a word boundary, appending an ellipsis
 *  only when it was actually shortened. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).replace(/\s+\S*$/, "").trimEnd() + "…";
}

export function repurpose(a: SourceArticle): Repurposed[] {
  const campaign = campaignSlug(a);
  const link = (channel: string) => variantLink(a.url, channel, campaign);

  // Repurpose from the article's OWN opening paragraph (the seam provides `body`),
  // not a fixed generic blurb — and never emit niche-specific hashtags a non-matching
  // project would post by mistake. Fall back to a generic lead only when no body exists.
  const paras = (a.body ?? "").split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const lead = paras[0] ?? "";
  const lead2 = paras[1] ?? lead;
  const genericLead =
    "Sepsali jsme praktického průvodce — to nejdůležitější na jednom místě, přehledně a prakticky.";
  const leadFor = (reserve: number, fallback = genericLead) =>
    clip(lead || fallback, Math.max(40, reserve));

  const nlLink = link("Newsletter");
  const xLink = link("X / Twitter");
  return [
    {
      channel: "Newsletter",
      max: CHANNEL_LIMITS.Newsletter,
      link: nlLink,
      text: `Předmět: ${a.title}\n\n${leadFor(CHANNEL_LIMITS.Newsletter - a.title.length - nlLink.length - 30)}\n\nČíst celý článek → ${nlLink}`,
    },
    {
      channel: "LinkedIn",
      max: CHANNEL_LIMITS.LinkedIn,
      link: link("LinkedIn"),
      text: `${a.title}\n\n${clip(lead2 || genericLead, 800)}\n\nCelý článek (a checklist) zde: ${link("LinkedIn")}`,
    },
    {
      channel: "Instagram",
      max: CHANNEL_LIMITS.Instagram,
      link: link("Instagram"),
      text: `${a.title} ✨\n\n${leadFor(180)}\n\nUložte si na později 📌 Celý článek na blogu — odkaz v biu.`,
    },
    {
      channel: "X / Twitter",
      max: CHANNEL_LIMITS["X / Twitter"],
      link: xLink,
      text: `${a.title} 🧵\n\n${leadFor(CHANNEL_LIMITS["X / Twitter"] - a.title.length - xLink.length - 6)}\n${xLink}`,
    },
  ];
}
