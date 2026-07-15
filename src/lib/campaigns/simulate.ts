/** Deterministic budget-reallocation simulation. Pure: reuses the same
 *  aggregate/deriveMetrics math as the rest of the campaign model, so a projected
 *  portfolio reconciles with the table by construction. No AI, no I/O. */
import { aggregate, type Campaign, type CampaignTotals } from "./types";

export interface BudgetMove {
  /** "shift" re-points spend to a recipient; "pause" stops the donor's spend
   *  entirely (no recipient — `toId`/`toName` stay empty). Optional for
   *  backward compatibility: absent means "shift". */
  kind?: "shift" | "pause";
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  /** CZK shifted from the donor to the recipient (or saved by pausing) */
  amount: number;
  /** donor / recipient ROAS at the time of the recommendation */
  fromRoas: number;
  toRoas: number;
  /** the donor's own period spend (CZK) at recommendation time. Lets a stored
   *  change-set self-describe how large a share of the donor a shift re-points —
   *  the input to the projection-confidence label — without re-loading campaigns.
   *  OPTIONAL for backward compatibility: change-sets persisted before this field
   *  omit it and read as full-confidence. */
  fromCost?: number;
  /** estimated extra conversion value = amount × (toRoas − fromRoas); 0 for a
   *  pause of a zero-return donor (nothing was coming back anyway) */
  estValueGain: number;
  /** estimated extra NET PROFIT the move buys = blended margin × estValueGain (a
   *  pause recovers its full saved spend). Present ONLY when the tenant has a
   *  persisted cost model whose blended margin was threaded into the recommender;
   *  absent otherwise, so margin-blind change-sets stay byte-identical. */
  estProfitGain?: number;
}

export interface SimulationResult {
  before: CampaignTotals;
  after: CampaignTotals;
}

// --- projection confidence ---------------------------------------------------
// A shift re-points spend at the RECIPIENT's current marginal efficiency. That
// linear first-cut is honest for a small reallocation but degrades as the moved
// share of the donor's spend grows — the recipient's marginal ROAS won't hold
// once its budget balloons, so a big shift's projected lift is optimistic. Rather
// than silently present the same confident number, the UI degrades the label
// above this share; the caveat in the caption becomes an enforced signal.

/** Above this share of a donor's own spend, a shift's linear projection is
 *  labelled low-confidence. Set at 50% — comfortably above the recommender's own
 *  40% shifts (plus the ≤100 CZK rounding on ≥1000 CZK donors), so an
 *  auto-recommendation always reads high-confidence and only a genuinely large or
 *  manually enlarged reallocation degrades. */
export const SIM_LOW_CONFIDENCE_DONOR_SHARE = 0.5;

export type SimulationConfidence = "high" | "low";

/** Share (0..1+) of a donor's own spend a SHIFT re-points, from the move's stored
 *  `fromCost`. A pause removes the donor's spend outright rather than
 *  extrapolating a recipient's marginal ROAS, so it carries no linear-extrapolation
 *  risk and returns 0; an unknown/zero donor cost (legacy move) also returns 0. */
export function moveDonorShare(move: BudgetMove): number {
  if (move.kind === "pause") return 0;
  if (typeof move.fromCost !== "number" || move.fromCost <= 0) return 0;
  return move.amount / move.fromCost;
}

/** Confidence in the linear projection for a whole change-set: "low" as soon as
 *  any shift re-points more than {@link SIM_LOW_CONFIDENCE_DONOR_SHARE} of its
 *  donor's spend, else "high". Pure; the UI degrades the projection's label. */
export function simulationConfidence(moves: BudgetMove[]): SimulationConfidence {
  return moves.some((m) => moveDonorShare(m) > SIM_LOW_CONFIDENCE_DONOR_SHARE) ? "low" : "high";
}

/**
 * Project the portfolio totals if `moves` are applied. Each move shifts spend
 * from a donor to a recipient; conversion value and conversions move with the
 * spend at each campaign's *own* current efficiency (a linear first-cut marginal
 * model — honest for a small reallocation, and clearly captioned as an estimate
 * in the UI). The same `aggregate` re-derives ratios, so the projected ROAS/PNO
 * are computed the identical way the live totals are.
 */
export function simulateBudgetShift(rows: Campaign[], moves: BudgetMove[]): SimulationResult {
  const before = aggregate(rows);
  const byId = new Map<string, Campaign>(rows.map((c) => [c.id, { ...c }]));

  for (const m of moves) {
    const from = byId.get(m.fromId);
    if (!from) continue;

    const amount = Math.min(m.amount, from.cost);
    if (amount <= 0) continue;

    const fromValPerCzk = from.cost > 0 ? from.conversionValue / from.cost : 0;
    const fromConvPerCzk = from.cost > 0 ? from.conversions / from.cost : 0;

    // A pause is the donor half of a shift with no recipient: the spend leaves
    // the portfolio (and whatever value it was buying leaves with it — 0 for a
    // zero-return donor), using the identical linear marginal model.
    if (m.kind === "pause") {
      from.cost -= amount;
      from.conversionValue = Math.max(0, from.conversionValue - amount * fromValPerCzk);
      from.conversions = Math.max(0, from.conversions - amount * fromConvPerCzk);
      continue;
    }

    const to = byId.get(m.toId);
    if (!to || from.id === to.id) continue;

    const toValPerCzk = to.cost > 0 ? to.conversionValue / to.cost : 0;
    const toConvPerCzk = to.cost > 0 ? to.conversions / to.cost : 0;

    from.cost -= amount;
    from.conversionValue = Math.max(0, from.conversionValue - amount * fromValPerCzk);
    from.conversions = Math.max(0, from.conversions - amount * fromConvPerCzk);

    to.cost += amount;
    to.conversionValue += amount * toValPerCzk;
    to.conversions += amount * toConvPerCzk;
  }

  return { before, after: aggregate([...byId.values()]) };
}
