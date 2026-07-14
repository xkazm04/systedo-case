/** One profit truth per tenant — the pure decision behind the /zisk reconciliation
 *  note. The /zisk module computes a blended margin by weighting live-editable
 *  per-channel margins over the channel mix; the report runs on ONE persisted
 *  blended `grossMarginPct` (the cost model). When the two drift far enough apart,
 *  the same merchant would read two different profits in two tabs — so /zisk surfaces
 *  the gap and points at the "apply to report" fix. This is just the numeric verdict:
 *  framework-free, numbers in → verdict out, so it can be unit-pinned. */

/** Divergence threshold in PERCENTAGE POINTS of margin. Below this, the two blended
 *  margins are "the same profit story" (rounding/mix noise) and no note shows; at or
 *  above it the gap is material enough that the profit lines would visibly disagree.
 *  2 p.b. ≈ the smallest gap that moves a mid-six-figure revenue's net profit by a
 *  noticeable amount while staying above per-channel rounding jitter. */
export const MARGIN_DIVERGENCE_PP = 2;

export interface MarginDivergence {
  /** true when |computed − persisted| ≥ threshold — the note should show. */
  diverged: boolean;
  /** signed gap in percentage points (computed − persisted), rounded to 1 dp;
   *  positive = /zisk sees a fatter margin than the report's model. */
  deltaPp: number;
  /** the module's computed blended margin, as a fraction (0..1), echoed for display. */
  computedMargin: number;
  /** the persisted cost-model blended margin, as a fraction (0..1). */
  persistedMargin: number;
}

/** Decide whether the /zisk computed blended margin diverges meaningfully from the
 *  persisted cost-model margin. Both inputs are FRACTIONS (0..1). Returns a verdict
 *  with the signed percentage-point gap. A non-finite or absent persisted margin
 *  means "no model to reconcile against" → never diverged. Pure. */
export function marginDivergence(
  computedMargin: number,
  persistedMargin: number | null | undefined,
  thresholdPp: number = MARGIN_DIVERGENCE_PP
): MarginDivergence {
  const persisted =
    typeof persistedMargin === "number" && Number.isFinite(persistedMargin) ? persistedMargin : NaN;
  const computed = Number.isFinite(computedMargin) ? computedMargin : NaN;
  // No persisted model (or unusable inputs) → nothing to reconcile.
  if (!Number.isFinite(persisted) || !Number.isFinite(computed)) {
    return {
      diverged: false,
      deltaPp: 0,
      computedMargin: Number.isFinite(computed) ? computed : 0,
      persistedMargin: Number.isFinite(persisted) ? persisted : 0,
    };
  }
  // Round to 1 dp BEFORE the comparison so the verdict matches the number shown and
  // an exact-boundary gap (e.g. 42 % vs 40 %) isn't tipped under the threshold by
  // binary-float error (0.42 − 0.4 ≈ 0.01999…).
  const deltaPp = Math.round((computed - persisted) * 1000) / 10;
  return {
    diverged: Math.abs(deltaPp) >= thresholdPp,
    deltaPp,
    computedMargin: computed,
    persistedMargin: persisted,
  };
}
