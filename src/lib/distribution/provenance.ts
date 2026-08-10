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
   *  attribution rows. There is no such import seam yet — `attributionForProject`
   *  is a per-project SCALING of a static fixture, not measurement — so this
   *  fails CLOSED: omitted → false → the panel discloses itself. When the seam
   *  lands, thread its liveness here and both panels stop disclosing together,
   *  because both read this one signal. */
  attributionLive?: boolean;
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
export function pageSampleGutter(hasOwnArticles: boolean): boolean {
  return !hasOwnArticles;
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
