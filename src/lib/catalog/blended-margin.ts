/** Direction 2 (wildcard) — the catalog's blended gross margin, so the report's
 *  cost-model editor can offer the client's REAL per-SKU margin as a one-click
 *  default instead of a guessed 45 %. Pure & framework-free (unit-tested).
 *
 *  Formula — a revenue-weighted mean of per-SKU margin:
 *
 *    weightᵢ  = max(0, priceᵢ) × max(0, dailyVelocityᵢ)   // daily revenue proxy
 *    marginᵢ  = offering.margin           (its own COGS margin, when known)
 *             else CATEGORY_MARGINS[cat]  (the shared per-category assumption)
 *             else CATEGORY_FALLBACK_MARGIN
 *    blended  = Σ(marginᵢ × weightᵢ) / Σ(weightᵢ)          when Σ(weight) > 0
 *             = null                                        otherwise
 *
 *  A fast-selling, higher-priced SKU pulls the blend toward its margin (it earns
 *  more of the revenue), which is exactly what a client's real gross margin is.
 *  Returns null when the catalog has no revenue-bearing product SKUs (empty
 *  catalog, or every product priced/velocity zero) — the caller renders nothing,
 *  never a fake 0 %. Category fallback comes from the single margin source of truth
 *  (`@/lib/margins`), the same table the inventory value-at-risk model uses. */
import type { Offering } from "./offering";
import { isProduct } from "./offering";
import { CATEGORY_FALLBACK_MARGIN, CATEGORY_MARGINS } from "@/lib/margins";

/** Per-SKU margin: its own when set & finite, else by category, else the fallback. */
function skuMargin(margin: number | undefined, category: string): number {
  if (typeof margin === "number" && Number.isFinite(margin)) return margin;
  return CATEGORY_MARGINS[category] ?? CATEGORY_FALLBACK_MARGIN;
}

/** Revenue-weighted blended gross margin (0–1) across a catalog's product SKUs, or
 *  null when nothing revenue-bearing resolves. See the module doc for the formula. */
export function catalogBlendedMargin(offerings: Offering[]): number | null {
  let weighted = 0;
  let totalWeight = 0;
  for (const o of offerings) {
    if (!isProduct(o)) continue;
    const weight = Math.max(0, o.price) * Math.max(0, o.dailyVelocity);
    if (weight <= 0) continue;
    weighted += skuMargin(o.margin, o.category) * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weighted / totalWeight : null;
}
