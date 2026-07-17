/** Deterministic speed-to-lead reply draft + qualification questions. Pure, no
 *  LLM — instant, always available. Real-integration seam: the AI tools (/api/ai)
 *  for richer, on-brand replies, then send via the channel. */
import type { InboundLead } from "./sample";

/** Respond within this many minutes or the lead goes cold. */
export const SLA_TARGET_MIN = 5;

export interface Draft {
  reply: string;
  questions: string[];
}

const firstName = (name: string) => name.split(" ")[0] ?? name;

/** Channel-aware contact-back sentence: promise the follow-up on the channel the lead
 *  actually used, never a phone call "within minutes" for an email with no number. Kept
 *  honest ("co nejdříve", not a hard minutes commitment). */
const CONTACT_BACK: Record<InboundLead["channel"], string> = {
  call: "ozveme se Vám zpět telefonicky co nejdříve",
  form: "ozveme se Vám na uvedený kontakt co nejdříve",
  chat: "odpovíme Vám zde co nejdříve",
  email: "odpovíme Vám na e-mail co nejdříve",
};

/** A deterministic first-response draft for an inbound lead. `brand` is the project's
 *  own team/brand name for the sign-off (absent → a neutral "náš tým", never a
 *  placeholder). The contact-back promise follows the lead's channel. */
export function draftReply(lead: InboundLead, brand?: string): Draft {
  const contact = CONTACT_BACK[lead.channel];
  const signoff = brand?.trim() ? `S pozdravem,\n${brand.trim()}` : "S pozdravem,\nnáš tým";
  const reply = `Dobrý den, ${firstName(lead.name)},

děkujeme za poptávku — rádi ji posuneme dál. Abychom Vám připravili přesnou nabídku, ${contact}; mezitím prosím o doplnění pár detailů níže.

${signoff}`;

  return {
    reply,
    questions: ["Jaký je předpokládaný termín realizace?", "Jaký je orientační rozpočet?", "Jaký je rozsah / velikost zakázky?"],
  };
}
