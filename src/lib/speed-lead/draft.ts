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

export function draftReply(lead: InboundLead): Draft {
  const reply = `Dobrý den, ${firstName(lead.name)},

děkujeme za poptávku — ráda/rád ji posunu dál. Abychom Vám připravili přesnou nabídku, ozvu se do pár minut telefonicky; mezitím prosím o doplnění pár detailů níže.

S pozdravem,
tým`;

  return {
    reply,
    questions: ["Jaký je předpokládaný termín realizace?", "Jaký je orientační rozpočet?", "Jaký je rozsah / velikost zakázky?"],
  };
}
