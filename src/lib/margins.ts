/** Single source of truth for gross-margin assumptions, so the profit module and
 *  the inventory module stop defining margin independently (inventory previously
 *  re-implemented the same idea "without importing it"). A marketing data analyst
 *  must be able to audit every margin number from one file.
 *
 *  Margin is keyed on two distinct dimensions, with intentionally distinct
 *  fallbacks — this is NOT a contradiction:
 *   - by CHANNEL  → used by the profit/POAS model (per-channel gross margin).
 *   - by CATEGORY → used by the inventory value-at-risk model (per-SKU margin).
 *
 *  Real-integration seam: replace all of these with COGS/margin pulled from
 *  Merchant Center / the ERP per product or category.
 *
 *  Known remaining seam (tracked under project-type-aware sample worlds): the
 *  profit module's illustrative *product-category mix* still uses generic
 *  categories (Elektronika…) rather than the real catalog's categories
 *  (Kočárky…), so a blended margin can't yet be rolled up across product views.
 *  The margin *tables and fallbacks* below are now shared; the product taxonomy
 *  is the next step. */

// --- by channel (profit / POAS) ---------------------------------------------

export const DEFAULT_CHANNEL_MARGINS: Record<string, number> = {
  "Google Ads (Search + PMax)": 0.42,
  "Google Nákupy": 0.36,
  "Sklik (Seznam)": 0.44,
  Heureka: 0.3,
  "Zboží.cz": 0.3,
  "Meta (FB / IG)": 0.4,
  "Organic & přímá": 0.58,
};

/** Fallback gross margin for a channel not in the table above. */
export const CHANNEL_FALLBACK_MARGIN = 0.45;

// --- by product category (inventory value-at-risk) --------------------------

/** Gross-margin fraction by product category, for the real catalog taxonomy. */
export const CATEGORY_MARGINS: Record<string, number> = {
  Kočárky: 0.22,
  Autosedačky: 0.28,
  Židličky: 0.34,
  Postýlky: 0.3,
  Chůvičky: 0.42,
  Nosítka: 0.48,
};

/** Fallback gross margin for a category not in the table above. */
export const CATEGORY_FALLBACK_MARGIN: number = 0.3;
