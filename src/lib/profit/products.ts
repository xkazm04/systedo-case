/** Product / category margin breakdown (#2). Pure compute: split the period's
 *  revenue and ad cost across product categories by revenue share, derive each
 *  category's gross margin from its cost of goods, and reduce to a ProfitRow-style
 *  rollup so the lowest-POAS categories surface. No I/O, no React. */
import type { ProductCategory, ProductRow, ProductSummary } from "./types";

/**
 * Roll the period totals up to product categories. Ad cost is allocated by
 * revenue share (we have no per-category spend), so a category's POAS reflects
 * its margin against the spend it implicitly consumes.
 */
export function computeProductProfit(
  products: ProductCategory[],
  totals: { revenue: number; cost: number }
): { rows: ProductRow[]; summary: ProductSummary } {
  const totalShare = products.reduce((a, p) => a + Math.max(0, p.revenueShare), 0);

  const out: ProductRow[] = products.map((p) => {
    // Normalise shares so they sum to 1 even if the dataset's don't exactly.
    const share = totalShare > 0 ? Math.max(0, p.revenueShare) / totalShare : 0;
    const revenue = totals.revenue * share;
    const cost = totals.cost * share;
    const marginPct = Math.max(0, Math.min(1, 1 - p.cogsPct));
    const grossProfit = revenue * marginPct;
    const netProfit = grossProfit - cost;
    const poas = cost > 0 ? grossProfit / cost : 0;
    const roas = cost > 0 ? revenue / cost : 0;
    const breakEvenRoas = marginPct > 0 ? 1 / marginPct : Infinity;
    return {
      category: p.category,
      color: p.color,
      revenue,
      cost,
      revenueShare: share,
      marginPct,
      grossProfit,
      netProfit,
      poas,
      breakEvenRoas,
      roas,
      // netProfit ≥ 0 rather than roas ≥ break-even, so a zero-cost row
      // (guarded roas=0) isn't falsely flagged as a loss. See profit/compute.ts.
      profitable: netProfit >= 0,
    };
  });

  const revenue = out.reduce((a, r) => a + r.revenue, 0);
  const cost = out.reduce((a, r) => a + r.cost, 0);
  const grossProfit = out.reduce((a, r) => a + r.grossProfit, 0);
  const netProfit = grossProfit - cost;

  return {
    // Sort by POAS ascending isn't ideal for the table (we want best→worst net
    // like the channel view), so sort by net profit; the UI picks the min-POAS
    // category for the callout.
    rows: out.sort((a, b) => b.netProfit - a.netProfit),
    summary: {
      revenue,
      cost,
      grossProfit,
      netProfit,
      poas: cost > 0 ? grossProfit / cost : 0,
      blendedMargin: revenue > 0 ? grossProfit / revenue : 0,
      unprofitableCount: out.filter((r) => !r.profitable).length,
    },
  };
}

/** The lowest-POAS category (for the callout), or null when there are none. */
export function lowestPoasCategory(rows: ProductRow[]): ProductRow | null {
  if (rows.length === 0) return null;
  return rows.reduce((lo, r) => (r.poas < lo.poas ? r : lo));
}
