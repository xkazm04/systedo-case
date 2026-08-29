/** Custom feed LABELS (WP W2-D) — the two strings the outbound product feed carries
 *  so a merchant can bid on profit and stock inside Google Merchant / Heureka / Zboží
 *  instead of guessing from a price column:
 *
 *    label0 — margin band   `marze-vysoka` | `marze-stredni` | `marze-nizka`
 *    label1 — stock status  `sklad-ok` | `sklad-low` | `sklad-pause` | `sklad-resuming`
 *
 *  This module RE-EXPOSES what the app already computes; it derives nothing of its
 *  own. Both numbers come out of `stockRows` (src/lib/inventory/compute.ts:107) — its
 *  `margin` field IS `marginOf(product)` (:69-74, i.e. `p.margin ?? CATEGORY_MARGINS
 *  [p.category] ?? CATEGORY_FALLBACK_MARGIN`, the same ladder profit/products.ts:22
 *  uses) and its `status` field IS the Sklad module's pacing verdict. Calling the
 *  ladder again here would be a second implementation that could silently disagree
 *  with the Sklad screen the merchant is looking at, so the one call answers both.
 *
 *  Pure — the caller supplies `now`, exactly like `stockRows`, so a feed served twice
 *  in the same second is byte-identical. */
import { stockRows, type StockStatus } from "@/lib/inventory/compute";
import type { Product } from "./sample";

/** Margin band cutoffs (gross-margin fraction, 0–1). Deliberately coarse: a feed label
 *  is a BIDDING BUCKET, not a number — a merchant writes one rule per band, so three
 *  bands is the most that stays actionable. */
export const MARGIN_BAND_HIGH = 0.45;
export const MARGIN_BAND_MID = 0.25;

export type MarginLabel = "marze-vysoka" | "marze-stredni" | "marze-nizka";
export type StockLabel = `sklad-${StockStatus}`;

export interface FeedLabels {
  /** margin band → `g:custom_label_0` / the `custom_label_0` PARAM */
  label0: MarginLabel;
  /** stock status → `g:custom_label_1` / the `custom_label_1` PARAM */
  label1: StockLabel;
}

/** The three-band ladder over a gross-margin fraction. Exported so the panel and the
 *  tests name the same cutoffs the feed does. */
export function marginBand(margin: number): MarginLabel {
  if (!Number.isFinite(margin)) return "marze-nizka";
  if (margin >= MARGIN_BAND_HIGH) return "marze-vysoka";
  if (margin >= MARGIN_BAND_MID) return "marze-stredni";
  return "marze-nizka";
}

/** Both labels for ONE product. `now` is the reference date the stock projection is
 *  taken from (the route passes the request instant; tests pass a fixed date). */
export function feedLabels(product: Product, now: Date = new Date()): FeedLabels {
  const row = stockRows([product], now)[0]!;
  return { label0: marginBand(row.margin), label1: `sklad-${row.status}` };
}

/** Labels for a whole catalog, keyed by SKU — one `stockRows` pass instead of one per
 *  product, which is what the serializer uses. Identical output to calling
 *  {@link feedLabels} per product: `stockRows` is per-row pure (it sorts, it never
 *  aggregates), so batching cannot change a single product's verdict.
 *
 *  A duplicate SKU resolves to the first row `stockRows` returns (worst cover first),
 *  so the pick is deterministic rather than "whichever the catalog happened to list
 *  last" — the serializer emits one item per offering and looks its labels up by SKU. */
export function feedLabelsBySku(products: Product[], now: Date = new Date()): Map<string, FeedLabels> {
  const out = new Map<string, FeedLabels>();
  for (const row of stockRows(products, now)) {
    if (out.has(row.product.sku)) continue;
    out.set(row.product.sku, { label0: marginBand(row.margin), label1: `sklad-${row.status}` });
  }
  return out;
}
