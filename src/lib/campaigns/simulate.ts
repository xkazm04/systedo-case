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
  /** estimated extra conversion value = amount × (toRoas − fromRoas); 0 for a
   *  pause of a zero-return donor (nothing was coming back anyway) */
  estValueGain: number;
}

export interface SimulationResult {
  before: CampaignTotals;
  after: CampaignTotals;
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
