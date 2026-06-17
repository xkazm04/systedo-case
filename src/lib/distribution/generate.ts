/** Deterministic one-to-many repurposing: a source article → channel-native
 *  variants respecting each platform's length. Pure, no LLM. Seam: the AI tools
 *  (/api/ai, social) for richer, on-brand variants. */
import type { SourceArticle } from "./sample";

export interface Repurposed {
  channel: string;
  text: string;
  /** soft character budget for the channel */
  max: number;
}

export function repurpose(a: SourceArticle): Repurposed[] {
  return [
    {
      channel: "Newsletter",
      max: 600,
      text: `Předmět: ${a.title}\n\nTento týden jsme sepsali kompletního průvodce. Najdete v něm to nejdůležitější na jednom místě — přehledně a prakticky.\n\nČíst celý článek → ${a.url}`,
    },
    {
      channel: "LinkedIn",
      max: 3000,
      text: `${a.title}\n\nShrnuli jsme praktický průvodce do tří bodů:\n• Co opravdu funguje\n• Časté chyby, kterým se vyhnout\n• Jednoduchý postup na začátek\n\nCelý článek (a checklist) zde: ${a.url}`,
    },
    {
      channel: "Instagram",
      max: 2200,
      text: `${a.title} ✨\n\nUložte si na později 📌 Kompletní průvodce máme na blogu — odkaz v biu.\n\n#rodicovstvi #miminko #tipy #blog`,
    },
    {
      channel: "X / Twitter",
      max: 280,
      text: `${a.title} 🧵\n\nKompletní průvodce v jednom článku — to nejdůležitější bez vaty:\n${a.url}`,
    },
  ];
}
