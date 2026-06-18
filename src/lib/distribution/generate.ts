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

export function repurpose(a: SourceArticle): Repurposed[] {
  const campaign = campaignSlug(a);
  const link = (channel: string) => variantLink(a.url, channel, campaign);

  return [
    {
      channel: "Newsletter",
      max: CHANNEL_LIMITS.Newsletter,
      link: link("Newsletter"),
      text: `Předmět: ${a.title}\n\nTento týden jsme sepsali kompletního průvodce. Najdete v něm to nejdůležitější na jednom místě — přehledně a prakticky.\n\nČíst celý článek → ${link("Newsletter")}`,
    },
    {
      channel: "LinkedIn",
      max: CHANNEL_LIMITS.LinkedIn,
      link: link("LinkedIn"),
      text: `${a.title}\n\nShrnuli jsme praktický průvodce do tří bodů:\n• Co opravdu funguje\n• Časté chyby, kterým se vyhnout\n• Jednoduchý postup na začátek\n\nCelý článek (a checklist) zde: ${link("LinkedIn")}`,
    },
    {
      channel: "Instagram",
      max: CHANNEL_LIMITS.Instagram,
      link: link("Instagram"),
      text: `${a.title} ✨\n\nUložte si na později 📌 Kompletní průvodce máme na blogu — odkaz v biu.\n\n#rodicovstvi #miminko #tipy #blog`,
    },
    {
      channel: "X / Twitter",
      max: CHANNEL_LIMITS["X / Twitter"],
      link: link("X / Twitter"),
      text: `${a.title} 🧵\n\nKompletní průvodce v jednom článku — to nejdůležitější bez vaty:\n${link("X / Twitter")}`,
    },
  ];
}
