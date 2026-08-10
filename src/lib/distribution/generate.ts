/** Deterministic one-to-many repurposing: a source article → channel-native
 *  variants respecting each platform's length. Pure, no LLM. Every variant's
 *  link is UTM-stamped per channel so what the user ships is attributable. Seam:
 *  the AI tools (/api/ai, social) for richer, on-brand variants. */
import type { SourceArticle } from "./sample";
import { campaignSlug, variantLink } from "./utm";
import { NEWSLETTER_CTA_LABELS, NEWSLETTER_SUBJECT_LABELS } from "./newsletter";
import { HOME_MARKET_LOCALE, type SupportedLocale } from "@/lib/format";

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

/** The copy this generator OWNS — the connective tissue it writes around the
 *  article's own words (the lead used when an article carries no body, and each
 *  channel's closing call to action).
 *
 *  These strings are not UI chrome: they are shipped inside a draft the user
 *  copies into an inbox, a LinkedIn composer or a scheduler. Hardcoded Czech
 *  meant an en-locale project's four cards were Czech on first paint, before any
 *  regenerate — so the copy is per-locale and the locale is a parameter, exactly
 *  as newsletter.ts already does for the email it exports. The Newsletter subject
 *  prefix and CTA deliberately REUSE the newsletter.ts constants: `splitNewsletter`
 *  parses the prefix back off this text, so one shared constant is what stops the
 *  writer and the reader from drifting apart per locale. */
interface VariantCopy {
  /** Stand-in lead for an article with no body — never niche-specific. */
  genericLead: string;
  /** LinkedIn closing line, before the link. */
  linkedInCta: string;
  /** Instagram closing line (Instagram has no in-post link). */
  instagramCta: string;
}

const COPY: Record<SupportedLocale, VariantCopy> = {
  cs: {
    genericLead:
      "Sepsali jsme praktického průvodce — to nejdůležitější na jednom místě, přehledně a prakticky.",
    linkedInCta: "Celý článek (a checklist) zde:",
    instagramCta: "Uložte si na později 📌 Celý článek na blogu — odkaz v biu.",
  },
  en: {
    genericLead:
      "We wrote a practical guide — everything that matters in one place, clearly and usably.",
    linkedInCta: "Full article (and checklist) here:",
    instagramCta: "Save it for later 📌 Full article on the blog — link in bio.",
  },
};

/** Turn a source article into channel-native variants.
 *
 *  @param locale language of the copy this generator writes around the article.
 *  Defaulted rather than required (newsletter.ts makes it required) for one
 *  reason: `normalizeRepurposeTracked` in lib/ai/tools/repurpose.ts calls this as
 *  the AI tool's demo/fallback floor and has no locale in scope. The default keeps
 *  that path byte-identical to today; threading a locale into the AI tool is a
 *  follow-up in that module. Every UI caller passes the active locale. */
export function repurpose(a: SourceArticle, locale: SupportedLocale = HOME_MARKET_LOCALE): Repurposed[] {
  const campaign = campaignSlug(a);
  const link = (channel: string) => variantLink(a.url, channel, campaign);
  const copy = COPY[locale] ?? COPY[HOME_MARKET_LOCALE];
  const subjectLabel = NEWSLETTER_SUBJECT_LABELS[locale] ?? NEWSLETTER_SUBJECT_LABELS[HOME_MARKET_LOCALE];
  const ctaLabel = NEWSLETTER_CTA_LABELS[locale] ?? NEWSLETTER_CTA_LABELS[HOME_MARKET_LOCALE];

  // Repurpose from the article's OWN opening paragraph (the seam provides `body`),
  // not a fixed generic blurb — and never emit niche-specific hashtags a non-matching
  // project would post by mistake. Fall back to a generic lead only when no body exists.
  const paras = (a.body ?? "").split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const lead = paras[0] ?? "";
  const lead2 = paras[1] ?? lead;
  const leadFor = (reserve: number, fallback = copy.genericLead) =>
    clip(lead || fallback, Math.max(40, reserve));

  const nlLink = link("Newsletter");
  const xLink = link("X / Twitter");
  return [
    {
      channel: "Newsletter",
      max: CHANNEL_LIMITS.Newsletter,
      link: nlLink,
      text: `${subjectLabel}: ${a.title}\n\n${leadFor(CHANNEL_LIMITS.Newsletter - a.title.length - nlLink.length - 30)}\n\n${ctaLabel} → ${nlLink}`,
    },
    {
      channel: "LinkedIn",
      max: CHANNEL_LIMITS.LinkedIn,
      link: link("LinkedIn"),
      text: `${a.title}\n\n${clip(lead2 || copy.genericLead, 800)}\n\n${copy.linkedInCta} ${link("LinkedIn")}`,
    },
    {
      channel: "Instagram",
      max: CHANNEL_LIMITS.Instagram,
      link: link("Instagram"),
      text: `${a.title} ✨\n\n${leadFor(180)}\n\n${copy.instagramCta}`,
    },
    {
      channel: "X / Twitter",
      max: CHANNEL_LIMITS["X / Twitter"],
      link: xLink,
      text: `${a.title} 🧵\n\n${leadFor(CHANNEL_LIMITS["X / Twitter"] - a.title.length - xLink.length - 6)}\n${xLink}`,
    },
  ];
}
