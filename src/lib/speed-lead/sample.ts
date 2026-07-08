/** Illustrative inbound leads for a lead-gen project's speed-to-lead inbox.
 *  Real-integration seam: form/call/email/chat intake webhooks. */

export type LeadChannel = "form" | "call" | "email" | "chat";

export interface InboundLead {
  id: string;
  name: string;
  channel: LeadChannel;
  message: string;
  /** minutes since the lead arrived */
  minutesAgo: number;
}

export const CHANNEL_LABELS: Record<LeadChannel, string> = {
  form: "Formulář",
  call: "Hovor",
  email: "E-mail",
  chat: "Chat",
};

export const SAMPLE_LEADS: InboundLead[] = [
  { id: "l1", name: "Jana Nováková", channel: "form", message: "Dobrý den, potřebovali bychom revizi elektroinstalace v kanceláři (cca 200 m²). Kdy máte volno?", minutesAgo: 11 },
  { id: "l2", name: "Petr Svoboda", channel: "call", message: "Zmeškaný hovor — poptávka na montáž klimatizace do bytu 3+1.", minutesAgo: 7 },
  { id: "l3", name: "Eva Dvořáková", channel: "chat", message: "Děláte i pravidelný servis? Máme 4 jednotky, zajímá nás roční smlouva.", minutesAgo: 3 },
  { id: "l4", name: "Tomáš Marek", channel: "email", message: "Prosím o cenovou nabídku na rekonstrukci rozvodů v rodinném domě.", minutesAgo: 24 },
];

/** D2 — the same response-clock inbox for a `local` business (a clinic/provider):
 *  booking-style enquiries where a missed one is a walk-in lost to the next result.
 *  Kept generic across local services (appointment / availability / price / new
 *  patient) so it reads right without pinning to one trade. */
export const LOCAL_SAMPLE_LEADS: InboundLead[] = [
  { id: "ll1", name: "Kateřina Horáková", channel: "call", message: "Zmeškaný hovor — sháním termín na vstupní prohlídku, jsem nový pacient.", minutesAgo: 6 },
  { id: "ll2", name: "Martin Beneš", channel: "form", message: "Dobrý den, můžu se objednat na tento týden? Bolí mě zub a potřeboval bych to co nejdřív.", minutesAgo: 14 },
  { id: "ll3", name: "Lucie Marková", channel: "chat", message: "Berete nové pacienty a máte smlouvu s pojišťovnou VZP?", minutesAgo: 2 },
  { id: "ll4", name: "Ondřej Král", channel: "email", message: "Prosím o cenu za dentální hygienu a nejbližší volný termín odpoledne.", minutesAgo: 21 },
];
