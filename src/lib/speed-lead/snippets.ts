/** Reply-snippet library for the speed-to-lead inbox: a small set of named Czech
 *  templates with {jméno} / {kanál} placeholders. Pure expansion + a coercer for
 *  the per-project localStorage payload. No React, no storage access here — the
 *  module owns the read/write; this file stays testable in isolation. */
import { CHANNEL_LABELS, type InboundLead } from "./sample";

export interface Snippet {
  id: string;
  /** Button label, e.g. "Cenová nabídka". */
  name: string;
  /** Body with {jméno} / {kanál} placeholders. */
  body: string;
}

/** The placeholders a snippet body may contain, filled from the selected lead. */
export interface SnippetVars {
  /** {jméno} — lead's first name. */
  jméno: string;
  /** {kanál} — human channel label (Formulář / Hovor / …). */
  kanál: string;
}

/** First token of a name, falling back to the whole string. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Build the expansion variables for a lead. Pure — no clock, no storage. */
export function snippetVarsFor(lead: InboundLead): SnippetVars {
  return { jméno: firstName(lead.name), kanál: CHANNEL_LABELS[lead.channel] };
}

/** Replace every {jméno} / {kanál} occurrence in a body. Unknown placeholders are
 *  left verbatim so a typo in a custom snippet is visible, not silently dropped. */
export function expandSnippet(body: string, vars: SnippetVars): string {
  return body.replace(/\{(jméno|kanál)\}/g, (_match, key: keyof SnippetVars) => vars[key]);
}

/** The built-in templates — the routine inquiry mix the sample inbox shows. */
export const DEFAULT_SNIPPETS: Snippet[] = [
  {
    id: "cenova-nabidka",
    name: "Cenová nabídka",
    body: "Dobrý den, {jméno},\n\nděkujeme za poptávku. Připravíme Vám cenovou nabídku na míru — pošleme ji do 24 hodin. Pro přesnou kalkulaci nám prosím potvrďte termín a rozsah zakázky.\n\nS pozdravem,\ntým",
  },
  {
    id: "termin-navstevy",
    name: "Termín návštěvy",
    body: "Dobrý den, {jméno},\n\nrádi se u Vás zastavíme na nezávaznou prohlídku. Vyhovoval by Vám tento týden dopoledne, nebo raději odpoledne? Ozveme se i přes {kanál} pro potvrzení.\n\nS pozdravem,\ntým",
  },
  {
    id: "rocni-servis",
    name: "Roční servis",
    body: "Dobrý den, {jméno},\n\nděkujeme za zájem o pravidelný servis. Nabízíme roční smlouvu s pravidelnými kontrolami a přednostním řešením poruch. Rád/ráda Vám pošlu podmínky a ceník.\n\nS pozdravem,\ntým",
  },
];

/** Validate a parsed localStorage blob into Snippet[], dropping malformed entries
 *  and falling back to the defaults entirely on anything unusable — a corrupt
 *  entry can never break the picker. */
export function coerceSnippets(raw: unknown): Snippet[] {
  if (!Array.isArray(raw)) return DEFAULT_SNIPPETS;
  const out: Snippet[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Partial<Snippet>;
    if (typeof r.id === "string" && typeof r.name === "string" && typeof r.body === "string") {
      out.push({ id: r.id, name: r.name, body: r.body });
    }
  }
  return out.length > 0 ? out : DEFAULT_SNIPPETS;
}
