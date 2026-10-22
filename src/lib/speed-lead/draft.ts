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

/** The first name to greet, or null when the field holds none: empty, or an
 *  identifier a caller put there (an e-mail, a phone number). Greeting an identifier
 *  or a filler word tells the lead nobody read who wrote; a bare "Dobrý den," does not. */
function greetingFirstName(name: string): string | null {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return /^\p{L}[\p{L}'’-]*$/u.test(first) ? first : null;
}

/** Channel-aware contact-back sentence: promise the follow-up on the channel the lead
 *  actually used, never a phone call "within minutes" for an email with no number. Kept
 *  honest ("co nejdříve", not a hard minutes commitment). */
const CONTACT_BACK: Record<InboundLead["channel"], string> = {
  call: "ozveme se Vám zpět telefonicky co nejdříve",
  form: "ozveme se Vám na uvedený kontakt co nejdříve",
  chat: "odpovíme Vám zde co nejdříve",
  email: "odpovíme Vám na e-mail co nejdříve",
};

/** A deterministic first-response draft for an inbound lead. The greeting names the
 *  person only when a first name was given (`greetingName`, else `name`). `brand` is the project's
 *  own team/brand name for the sign-off (absent → a neutral "náš tým", never a
 *  placeholder). The contact-back promise follows the lead's channel. */
export function draftReply(lead: InboundLead, brand?: string): Draft {
  const contact = CONTACT_BACK[lead.channel];
  const signoff = brand?.trim() ? `S pozdravem,\n${brand.trim()}` : "S pozdravem,\nnáš tým";
  const first = greetingFirstName(lead.greetingName ?? lead.name);
  const reply = `${first ? `Dobrý den, ${first},` : "Dobrý den,"}

děkujeme za poptávku — rádi ji posuneme dál. Abychom Vám připravili přesnou nabídku, ${contact}; mezitím prosím o doplnění pár detailů níže.

${signoff}`;

  return {
    reply,
    questions: ["Jaký je předpokládaný termín realizace?", "Jaký je orientační rozpočet?", "Jaký je rozsah / velikost zakázky?"],
  };
}
