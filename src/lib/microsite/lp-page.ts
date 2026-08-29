/** W3-B — the hosted LP experiment's wire-door helpers: mint its public slug and
 *  bound the arm copy an operator submits for publication.
 *
 *  Kept out of the route (and out of `microsite.ts`, which holds policy, not parsing)
 *  so the SAME bounds are unit-testable without a request. Pure — no store, no
 *  session, no framework. The shape deliberately mirrors `local-page.ts`, because it
 *  is the same job on a different payload and a second idiom would be a second set of
 *  bugs.
 *
 *  WHAT RIDES THE WIRE AND WHAT DOES NOT. The PROSE is the draft the operator
 *  generated and previewed, so it rides. Everything that is a FACT about the tenant
 *  does not: `experimentId` is checked against the caller's own experiments,
 *  `projectId` comes from the ownership guard, and `armId`s are minted server-side
 *  and matched to the experiment's real arm count. A tampered body can therefore add
 *  no arm the experiment does not have, and can point no counter at another tenant.
 *
 *  There is deliberately NO numeric field anywhere in this payload. An experiment page
 *  that printed its own score would stop producing independent trials, and the numbers
 *  it would print are not the page's to know — they live in the counter table. */
import { slugify } from "@/lib/nav";
import { MICROSITE_SLUG_RE } from "@/lib/microsite-identity";
import type { LpArmCopy } from "./types";

/** MICROSITE_SLUG_RE's upper bound — a cluster name is easily longer, so the slug is
 *  trimmed (never rejected) at a dash so the tail stays a whole word. `local-page.ts`
 *  makes the same call for the same reason. */
const SLUG_MAX = 40;

/** Per-field caps. The page is public, so an unbounded model field must never reach
 *  it; the bullet list is capped at five because a landing page with a scrolling
 *  feature list is a different page than the one that was drafted and previewed. */
export const LP_ARM_LIMITS = {
  label: 60,
  headline: 120,
  intro: 600,
  bullet: 160,
  bullets: 5,
  cta: 60,
  target: 300,
} as const;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const cut = (v: unknown, n: number): string => {
  const s = str(v);
  return s.length <= n ? s : s.slice(0, n).trimEnd();
};

/** The public slug for a hosted experiment: `{client}-{cluster}`, folded to the
 *  registry's grammar and trimmed at a word boundary. Returns "" when nothing
 *  slug-shaped survives, which the caller reports as the same 422 the other publish
 *  paths return.
 *
 *  The slug carries the CLUSTER, not the arm: all arms live at ONE address, because
 *  the split is what is being measured. A per-arm URL would let a visitor (or a link
 *  a visitor shares) select their own arm, which is not a randomised trial. */
export function mintLpSlug(clientName: string, cluster: string): string {
  const full = slugify(`${clientName} ${cluster}`);
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

/** Only a CTA destination the operator can have meant. `tel:` and `mailto:` are the
 *  `isOperatorContact` set; `https:` joins them because a landing page's action is
 *  normally a signup URL. Plain `http:` is out (a public page must not downgrade its
 *  visitor), and so is everything else — `javascript:`, `data:`, a bare string —
 *  which is dropped rather than rendered as a link on a public page. */
export function isOperatorTarget(value: unknown): value is string {
  const s = str(value);
  return (
    s.length > 0 &&
    s.length <= LP_ARM_LIMITS.target &&
    /^(tel:|mailto:|https:\/\/)[^\s<>"']+$/i.test(s)
  );
}

/** Bound ONE submitted arm against a SERVER-supplied identity, or null when there is
 *  no usable copy. The `armId` argument is the point: the caller mints it (or carries
 *  a previous one forward) and passes it in, so an id from the request body is never
 *  what a counter row ends up keyed by. */
export function sanitizeLpArm(raw: unknown, armId: string, index = 0): LpArmCopy | null {
  if (!raw || typeof raw !== "object" || !armId) return null;
  const o = raw as Record<string, unknown>;
  const headline = cut(o.headline, LP_ARM_LIMITS.headline);
  const intro = cut(o.intro, LP_ARM_LIMITS.intro);
  // A page with no headline or no intro is a blank public URL — refuse it here rather
  // than publish a stub, the same call `sanitizeLocalPageText` makes.
  if (!headline || !intro) return null;
  const bullets = (Array.isArray(o.bullets) ? o.bullets : [])
    .map((b) => cut(b, LP_ARM_LIMITS.bullet))
    .filter((b) => b.length > 0)
    .slice(0, LP_ARM_LIMITS.bullets);
  return {
    armId,
    label: cut(o.label, LP_ARM_LIMITS.label) || `Varianta ${index + 1}`,
    headline,
    intro,
    bullets,
    cta: cut(o.cta, LP_ARM_LIMITS.cta),
  };
}

/** Bound a whole submitted arm set against the server's minted identities. Returns []
 *  unless EVERY arm survives: a partially-published experiment would serve traffic to
 *  arms that are not all being measured, and the arithmetic downstream would compare
 *  a page against nothing. `armIds` fixes both the count and the identities — extra
 *  submitted arms are ignored by construction (the loop runs over the ids, not over
 *  the body). */
export function sanitizeLpArms(raw: unknown, armIds: readonly string[]): LpArmCopy[] {
  if (!Array.isArray(raw) || armIds.length === 0) return [];
  const seen = new Set<string>();
  const out: LpArmCopy[] = [];
  for (let i = 0; i < armIds.length; i++) {
    const armId = armIds[i]!;
    // Duplicate identities would collapse two arms onto one counter row — every view
    // of either would count for both, which is not a comparison at all.
    if (seen.has(armId)) return [];
    seen.add(armId);
    const arm = sanitizeLpArm(raw[i], armId, i);
    if (!arm) return [];
    out.push(arm);
  }
  return out;
}
