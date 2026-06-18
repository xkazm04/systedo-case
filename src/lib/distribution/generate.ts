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

export function repurpose(a: SourceArticle): Repurposed[] {
  const campaign = campaignSlug(a);
  const link = (channel: string) => variantLink(a.url, channel, campaign);

  return [
    {
      channel: "Newsletter",
      max: 600,
      link: link("Newsletter"),
      text: `Předmět: ${a.title}\n\nTento týden jsme sepsali kompletního průvodce. Najdete v něm to nejdůležitější na jednom místě — přehledně a prakticky.\n\nČíst celý článek → ${link("Newsletter")}`,
    },
    {
      channel: "LinkedIn",
      max: 3000,
      link: link("LinkedIn"),
      text: `${a.title}\n\nShrnuli jsme praktický průvodce do tří bodů:\n• Co opravdu funguje\n• Časté chyby, kterým se vyhnout\n• Jednoduchý postup na začátek\n\nCelý článek (a checklist) zde: ${link("LinkedIn")}`,
    },
    {
      channel: "Instagram",
      max: 2200,
      link: link("Instagram"),
      text: `${a.title} ✨\n\nUložte si na později 📌 Kompletní průvodce máme na blogu — odkaz v biu.\n\n#rodicovstvi #miminko #tipy #blog`,
    },
    {
      channel: "X / Twitter",
      max: 280,
      link: link("X / Twitter"),
      text: `${a.title} 🧵\n\nKompletní průvodce v jednom článku — to nejdůležitější bez vaty:\n${link("X / Twitter")}`,
    },
  ];
}
