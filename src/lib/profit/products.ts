/** Product / category margin breakdown (#2). Pure compute: split the period's
 *  revenue and ad cost across product categories by revenue share, derive each
 *  category's gross margin from its cost of goods, and reduce to a ProfitRow-style
 *  rollup so the lowest-POAS categories surface. No I/O, no React. */
import type { ProductCategory, ProductRow, ProductSummary } from "./types";
import type { Product } from "@/lib/catalog/sample";
import { CATEGORY_FALLBACK_MARGIN, CATEGORY_MARGINS } from "@/lib/margins";
import { computeMarginRow } from "./compute";
import { roas as roasOf } from "@/lib/metrics/ratios";

/** Palette for catalog-derived categories (deterministic by revenue rank). */
const CATEGORY_COLORS = ["#1f8f88", "#2dd4ce", "#fb7141", "#f59e0b", "#15324b", "#6366f1"];

/** Derive the profit category mix from the real product catalog: revenue proxied by
 *  price×velocity per SKU, cost of goods from each SKU's margin (or the category
 *  fallback). Replaces the generic mock so Zisk agrees with the catalog and Sklad
 *  on the same taxonomy. Returns [] for an empty catalog (callers fall back). */
export function categoryMixFromCatalog(products: Product[]): ProductCategory[] {
  const byCat = new Map<string, { rev: number; marginRev: number }>();
  for (const p of products) {
    const rev = p.price * p.dailyVelocity;
    const margin = p.margin ?? CATEGORY_MARGINS[p.category] ?? CATEGORY_FALLBACK_MARGIN;
    const cur = byCat.get(p.category) ?? { rev: 0, marginRev: 0 };
    cur.rev += rev;
    cur.marginRev += rev * margin;
    byCat.set(p.category, cur);
  }
  const total = [...byCat.values()].reduce((a, c) => a + c.rev, 0);
  return [...byCat.entries()]
    .sort((a, b) => b[1].rev - a[1].rev)
    .map(([category, { rev, marginRev }], i) => {
      const margin = rev > 0 ? marginRev / rev : CATEGORY_FALLBACK_MARGIN;
      return {
        category,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]!,
        revenueShare: total > 0 ? rev / total : 0,
        cogsPct: Math.max(0, Math.min(1, 1 - margin)),
      };
    });
}

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
    return {
      category: p.category,
      color: p.color,
      revenue,
      cost,
      revenueShare: share,
      marginPct,
      ...computeMarginRow(revenue, cost, marginPct),
      roas: roasOf(revenue, cost),
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
