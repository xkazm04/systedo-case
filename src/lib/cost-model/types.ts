/** A3 — a project's real cost structure, entered once and persisted server-side, so
 *  the monthly report's profit reflects TRUE net margin (after COGS + overhead), not
 *  the pre-COGS contribution (revenue − ad spend) it shows by default. The detailed
 *  per-channel `zisk` module keeps its own live editor; this is the blended,
 *  report-facing model a client report needs. Absent → the report stays on the
 *  honest pre-COGS contribution + a "zadejte marži" CTA. */
export interface CostModel {
  /** blended gross margin as a fraction of revenue (0..1) = 1 − COGS% */
  grossMarginPct: number;
  /** fixed monthly overhead in Kč (rent, salaries, tooling) */
  monthlyOverhead: number;
  /** variable fulfilment cost per order/conversion in Kč */
  perOrderCost: number;
  /** ISO timestamp of the last edit */
  updatedAt: string;
}
