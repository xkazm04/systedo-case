/** Per-PANEL data provenance for Distribuce.
 *
 *  The module used to make one blanket claim: the page rendered ModulePage's
 *  `sample` gutter from whether the project had handed any of its OWN articles
 *  over. Hand one article in and the gutter disappeared — while the attribution
 *  table and the whole Insights panel kept rendering `attributionForProject()`,
 *  a static fixture with no analytics import seam. The page then said "not
 *  sample" over two panels that are fixture by construction.
 *
 *  The rule (the same one lib/insights/aggregate.ts settled on with its
 *  `from()` / `fixture()` pair): a disclosure follows the DERIVATION of the thing
 *  it sits on, never the project. Each panel below reads exactly one signal, so
 *  each carries its own flag — a project distributing its own article gets an
 *  undisclosed source/variants pair next to a disclosed attribution table, which
 *  is precisely the truth.
 *
 *  Pure, framework-free (no React, no I/O) so the server page and the client
 *  module derive the same answer from the same function. */
import type { SourceOrigin } from "./variants";

/** The four disclosure surfaces of the module, in render order. */
export type DistributionPanel = "source" | "variants" | "attribution" | "learnings";

/** Which seams are actually live for this project's Distribuce view. */
export interface DistributionSeams {
  /** Origin of the article currently open (see selectSource): the fixture
   *  article, or one the user handed over from a draft. */
  sourceOrigin: SourceOrigin;
  /** True once per-variant click analytics (UTM-tagged clicks) actually feed the
   *  attribution rows. It fails CLOSED: omitted → false → the panel discloses
   *  itself, and both panels stop disclosing together because both read this one
   *  signal.
   *
   *  THE SEAM LANDED (WP W2-A). The tenant's own `/go/{id}` links are measured —
   *  the public redirect bumps a daily counter and the `go-rollup` ledger step
   *  folds them into per-channel outcomes — so this is now derived rather than
   *  hypothetical: `attributionIsLive(outcomes)` below. It stays a BOOLEAN and
   *  stays fail-closed, because "the tenant minted a link" is not measurement
   *  either; only a counted click is. `attributionForProject` is untouched and
   *  remains the illustrative path for everyone with no measured clicks. */
  attributionLive?: boolean;
}

/** Do these rolled-up channel outcomes constitute MEASUREMENT?
 *
 *  One counted click is the bar, and it is deliberately not lower. A minted link
 *  with no clicks proves the tenant set something up, not that anything happened —
 *  flipping the panel on a mint would replace a labelled fixture with an honest but
 *  entirely empty table, which reads as "your channels produced nothing" rather than
 *  "nothing has been measured yet". Shaped to take the outcome rows directly so the
 *  page, the module and the test all ask the same question of the same data. */
export function attributionIsLive(
  outcomes: readonly { clicks30d: number }[] | null | undefined
): boolean {
  return !!outcomes && outcomes.some((o) => o.clicks30d > 0);
}

/** True = "this panel is illustrative, say so". Per panel, never per project. */
export type PanelProvenance = Record<DistributionPanel, boolean>;

/** Per-panel sample flags for one Distribuce render.
 *
 *  - `source` / `variants` follow the chosen article: the fixture article is
 *    illustrative, the user's own handed-over article is not. (The variants are
 *    deterministically repurposed FROM the source, so they inherit its origin —
 *    a real article never yields sample variants.)
 *  - `attribution` / `learnings` follow the analytics seam. The Insights panel is
 *    a pure rollup OVER the attribution rows (rollupLearnings), so it can never
 *    be more trustworthy than they are. */
export function panelProvenance({ sourceOrigin, attributionLive = false }: DistributionSeams): PanelProvenance {
  const fromSource = sourceOrigin === "sample";
  const fromAttribution = !attributionLive;
  return {
    source: fromSource,
    variants: fromSource,
    attribution: fromAttribution,
    learnings: fromAttribution,
  };
}

/** The page-level `sample` gutter is a BLANKET claim over everything below it, so
 *  it may only be made when every panel is illustrative. Today that is exactly
 *  "the project has handed no article of its own over" — with one handed over,
 *  the blanket claim is false and the two fixture panels disclose themselves
 *  instead (see {@link panelProvenance}).
 *
 *  Kept here rather than inline in the page so the gutter and the panel chips are
 *  derived from ONE module and can be pinned against each other in one test. */
export function pageSampleGutter(hasOwnArticles: boolean, attributionLive = false): boolean {
  // WP W2-A: the attribution/insights half can now go live INDEPENDENTLY of the
  // article (a tenant can measure `/go` clicks while still distributing the fixture
  // article). The blanket claim must therefore answer to both halves, or a project
  // with real measured rows would sit under a banner calling the whole page
  // illustrative — the exact over-claim `isProvenanceCoherent` exists to catch.
  return !hasOwnArticles && !attributionLive;
}

/** Does this render make a claim that contradicts itself? True when the blanket
 *  gutter is shown while some panel is NOT illustrative (the gutter over-claims),
 *  or when the gutter is hidden and nothing discloses the fixture panels. Exists
 *  to be asserted in tests — the module's honesty invariant, executable. */
export function isProvenanceCoherent(gutter: boolean, panels: PanelProvenance): boolean {
  const values = Object.values(panels);
  if (gutter) return values.every(Boolean);
  return true;
}
