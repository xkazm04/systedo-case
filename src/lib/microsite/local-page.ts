/** W2-C — the local-landing microsite's wire-door helpers: mint its public slug and
 *  bound the page text a client submits for publication.
 *
 *  Kept out of the route (and out of `microsite.ts`, which holds policy, not parsing)
 *  so the SAME bounds are unit-testable without a request. Pure — no store, no
 *  session, no framework.
 *
 *  What is trusted, and what is not. The PROSE is the draft the operator generated
 *  and previewed, so it rides the wire; every FACT does not. Price, price model,
 *  currency, service and area are re-derived server-side from the catalog by the
 *  publish route, so a tampered body cannot put an invented price on a public page.
 *  The only contact detail that may exist is one the OPERATOR typed, restricted to
 *  `tel:` / `mailto:` — the model is never asked for one, and there is no address /
 *  opening-hours field to fabricate into. */
import { slugify } from "@/lib/nav";
import { MICROSITE_SLUG_RE } from "@/lib/microsite-identity";
import type { LocalPagePayload } from "./types";

/** MICROSITE_SLUG_RE's upper bound — a service×area slug is easily longer, so it is
 *  trimmed (never rejected) at a dash so the tail stays a whole word. */
const SLUG_MAX = 40;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const cut = (v: unknown, n: number): string => {
  const s = str(v);
  return s.length <= n ? s : s.slice(0, n).trimEnd();
};

/** The public slug for a service×area page: `{client}-{service}-{area}`, folded to
 *  the registry's grammar and trimmed at a word boundary. Returns "" when nothing
 *  slug-shaped survives (an all-punctuation name), which the caller reports as the
 *  same 422 the performance publish already returns. */
export function mintLocalSlug(clientName: string, service: string, area: string): string {
  const full = slugify(`${clientName} ${service} ${area}`);
  if (!full) return "";
  let slug = full;
  if (slug.length > SLUG_MAX) {
    slug = slug.slice(0, SLUG_MAX);
    const lastDash = slug.lastIndexOf("-");
    // Keep whole words, but never trim below the 3-char minimum the grammar needs.
    if (lastDash >= 3) slug = slug.slice(0, lastDash);
  }
  slug = slug.replace(/^-+|-+$/g, "");
  return MICROSITE_SLUG_RE.test(slug) ? slug : "";
}

/** Only a contact scheme the operator can have meant. Anything else (http, javascript,
 *  a bare string) is dropped rather than rendered as a link on a public page. */
export function isOperatorContact(value: unknown): value is string {
  const s = str(value);
  return s.length > 0 && s.length <= 120 && /^(tel:|mailto:)[^\s<>"']+$/i.test(s);
}

/** Bound a submitted page body to the published contract. Returns null when there is
 *  no usable text at all — the route then refuses rather than publishing a blank page
 *  at an indexable URL. Unknown keys are dropped by construction. */
export function sanitizeLocalPageText(input: unknown): LocalPagePayload["page"] | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const headline = cut(o.headline, 120);
  const intro = cut(o.intro, 800);
  if (!headline || !intro) return null;
  const sections = (Array.isArray(o.sections) ? o.sections : [])
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    .map((s) => ({ heading: cut(s.heading, 120), body: cut(s.body, 1200) }))
    .filter((s) => s.heading && s.body)
    .slice(0, 4);
  if (sections.length === 0) return null;
  const faq = (Array.isArray(o.faq) ? o.faq : [])
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object")
    .map((f) => ({ q: cut(f.q, 200), a: cut(f.a, 800) }))
    .filter((f) => f.q && f.a)
    .slice(0, 4);
  const page: LocalPagePayload["page"] = {
    headline,
    intro,
    sections,
    faq,
    cta: cut(o.cta, 120),
  };
  // The honest "no model wrote this" marker survives publication; any other value is
  // dropped rather than trusted.
  if (str(o.source) === "fallback") page.source = "fallback";
  return page;
}
