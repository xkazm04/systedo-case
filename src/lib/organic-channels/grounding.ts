/** Grounding assembly for Kanály zdarma — the ONE place that decides what the
 *  channel plan (seeded fill + `channel-research` prompt) is allowed to know about
 *  the business. Two sources feed it:
 *
 *    1. the CATALOG spine — offering categories, offering names, localities, and the
 *       CURATED competitor set: facts the tenant maintains inside the product;
 *    2. the applied ONBOARDING SCAN profile — summary / offering / audience /
 *       keywords read off the tenant's own homepage during first-run.
 *
 *  PRECEDENCE: the catalog wins wherever both know something; the profile only ever
 *  FILLS A GAP. A tenant who curated a catalog gets exactly the grounding they got
 *  before this module existed (see the byte-identical guarantee in the tests) — the
 *  profile exists to rescue the URL-first tenant whose catalog is still empty, who
 *  previously got a type+brand-only prompt and "vaší firmy / vaší nabídky"
 *  placeholders in the seeded plan.
 *
 *  DELIBERATELY NOT MERGED: the profile's `competitors`. Those are the scan's
 *  SPECULATIVE guesses; the apply route lands them in the competitor store as
 *  UNCONFIRMED `scan` entries and `curatedCompetitors` filters them out until the
 *  tenant keeps them. Grounding is handed to the model as fact, so an unconfirmed
 *  guess must not be asserted as one of the tenant's rivals — reading them here
 *  would route around that gate. The profile's `toneOfVoice` belongs to the Brand
 *  Voice twin, not to a channel plan.
 *
 *  Pure and framework-free: no I/O, no Next, no store. The page does the reads. */
import type { OnboardingScanProfile } from "@/lib/onboarding/types";
import { curatedCompetitors, type Competitor } from "@/lib/competitors/types";
import { competitorsGrounding } from "./types";

/** What the kanaly page hands the client (and, through it, the `channel-research`
 *  request). Bounds mirror `validateChannelResearchRequest`, so nothing assembled
 *  here can be silently truncated on the wire. */
export interface ChannelGrounding {
  offering?: string;
  localities?: string[];
  competitors?: string[];
  keywords?: string[];
  /** one-paragraph read of what the business does — scan profile only (the catalog
   *  has no equivalent); grounds the model beyond a bare category list */
  businessSummary?: string;
  /** who the business sells to — scan profile only; steers community/social picks */
  audience?: string;
  /** the competitors READ failed (≠ "tenant has none"): regeneration would run
   *  un-grounded, so the regenerate affordance discloses the degradation */
  competitorsUnavailable?: boolean;
}

/** The catalog-derived spine, read by the page. */
export interface KanalyGroundingInput {
  /** distinct catalog categories, in catalog order */
  categories: string[];
  /** distinct catalog offering names, in catalog order */
  offeringNames: string[];
  /** localities the project serves */
  localities: string[];
  /** CURATED competitor names only — never the unconfirmed scan suggestions */
  competitors: string[];
  /** the competitors read threw (≠ the tenant has none) */
  competitorsUnavailable: boolean;
  /** the applied website-scan profile, when the tenant ran + applied one */
  profile?: OnboardingScanProfile | null;
}

export interface KanalyGroundingResult {
  grounding: ChannelGrounding;
  /** placeholder fill for the SEEDED plan (`{category}` / `{locality}`), so a
   *  catalog-less tenant stops reading "vaší nabídky" once the scan knows better */
  sample: { category?: string; locality?: string };
}

/** What the SERVER pages actually hold after their reads: the catalog rows, the
 *  localities, the competitor read (which can FAIL), and the applied scan profile. */
export interface KanalyPageReads {
  /** persisted or seeded catalog offerings, in catalog order */
  catalog: readonly { name: string; category: string }[];
  /** localities the project serves, in `localitiesFor` order */
  localities: readonly { name: string }[];
  /** The competitor leg. Omit it entirely for a caller that deliberately does not
   *  read competitors — they ground the AI REGENERATION prompt, not the seeded
   *  plan's fill, so a caller that only needs the seeded plan (the shared visibility
   *  plan) can skip the read without changing a single channel or a single word. */
  competitorRead?: { failed: boolean; competitors: readonly Competitor[] | null | undefined };
  /** the applied website-scan profile, when the tenant ran + applied one */
  profile?: OnboardingScanProfile | null;
}

/** Turn one server page's raw reads into the pure builder's input.
 *
 *  This composition used to live inline in `/kanaly`'s page component — untestable
 *  there, and already duplicated (minus the competitor leg) inside
 *  `visibility-plan-resolve`. Two copies of "what may ground the plan" is exactly
 *  the shape that lets two pages describe the same project differently, so it is one
 *  function now and both server callers use it.
 *
 *  THE TWO DECISIONS IT CARRIES, both of them rules rather than plumbing:
 *   • CURATED COMPETITORS ONLY. `curatedCompetitors` drops the website scan's
 *     unconfirmed `scan`-sourced guesses. This grounding is handed to the model as
 *     fact; asserting a guess as one of the tenant's rivals would route around the
 *     confirm gate the apply route deliberately put there.
 *   • "UNAVAILABLE" ≠ "NONE". Only a FAILED read degrades the regenerate affordance.
 *     A tenant who genuinely has no competitors is not owed a warning; a tenant whose
 *     read blinked IS, because regenerating now would silently drop that grounding. */
export function kanalyGroundingInput(reads: KanalyPageReads): KanalyGroundingInput {
  const competitors = reads.competitorRead
    ? curatedCompetitors([...(reads.competitorRead.competitors ?? [])]).map((c) => c.name)
    : [];
  return {
    categories: [...new Set(reads.catalog.map((o) => o.category).filter(Boolean))],
    offeringNames: reads.catalog.map((o) => o.name),
    localities: reads.localities.map((l) => l.name),
    competitors,
    competitorsUnavailable:
      competitorsGrounding(reads.competitorRead?.failed ?? false, competitors) === "unavailable",
    profile: reads.profile ?? null,
  };
}

/** Wire bounds, mirroring `validateChannelResearchRequest` / `sanitizeScanProfile`. */
const MAX_OFFERING = 300;
const MAX_SUMMARY = 600;
const MAX_AUDIENCE = 300;
const MAX_KEYWORD = 120;
const MAX_KEYWORDS = 8;

const clean = (v: unknown, max: number): string =>
  (typeof v === "string" ? v.trim() : "").slice(0, max).trim();

/** The first named thing in a free-text offering ("kojenecké potřeby, autosedačky"
 *  → "kojenecké potřeby") — a usable stand-in for a catalog category in the seeded
 *  plan's `{category}` slot. */
function firstTerm(offering: string): string {
  const term = offering.split(/[,;·|/]|\s+a\s+/)[0]?.trim() ?? "";
  return term.length > 60 ? "" : term;
}

/** Merge the catalog spine with the applied scan profile into the grounding the
 *  channel plan speaks from. Catalog wins where both know; the profile fills gaps;
 *  with no profile the result is exactly the catalog-only grounding. */
export function buildKanalyGrounding(input: KanalyGroundingInput): KanalyGroundingResult {
  const profile = input.profile ?? null;

  // Offering — a scalar, so "catalog wins" is outright: the catalog string is used
  // verbatim (uncapped, as before; the wire validator caps it), and the profile's
  // offering is consulted ONLY when the catalog has no categories at all.
  const catalogOffering = input.categories.slice(0, 4).join(", ");
  const profileOffering = clean(profile?.offering, MAX_OFFERING);
  const offering = catalogOffering || profileOffering;

  // Keywords — a list, so "fills the gaps" is a top-up: every catalog offering name
  // first (deduped exactly as before), then scan keywords the catalog does not
  // already name, up to the same cap of 8. An empty profile leaves the catalog list
  // untouched, including its ordering and its exact-string de-dupe.
  const catalogKeywords = [...new Set(input.offeringNames.filter(Boolean))].slice(0, MAX_KEYWORDS);
  const keywords = [...catalogKeywords];
  const seen = new Set(catalogKeywords.map((k) => k.toLowerCase()));
  for (const raw of profile?.keywords ?? []) {
    if (keywords.length >= MAX_KEYWORDS) break;
    const kw = clean(raw, MAX_KEYWORD);
    if (!kw || seen.has(kw.toLowerCase())) continue;
    seen.add(kw.toLowerCase());
    keywords.push(kw);
  }

  // Profile-only fields: the catalog has no equivalent, so there is nothing to lose to.
  const businessSummary = clean(profile?.summary, MAX_SUMMARY);
  const audience = clean(profile?.audience, MAX_AUDIENCE);

  const grounding: ChannelGrounding = {
    ...(offering ? { offering } : {}),
    ...(input.localities.length ? { localities: input.localities } : {}),
    ...(input.competitors.length ? { competitors: input.competitors } : {}),
    ...(input.competitorsUnavailable ? { competitorsUnavailable: true } : {}),
    ...(keywords.length ? { keywords } : {}),
    ...(businessSummary ? { businessSummary } : {}),
    ...(audience ? { audience } : {}),
  };

  return {
    grounding,
    sample: {
      ...(input.categories[0] || firstTerm(profileOffering)
        ? { category: input.categories[0] || firstTerm(profileOffering) }
        : {}),
      ...(input.localities[0] ? { locality: input.localities[0] } : {}),
    },
  };
}
