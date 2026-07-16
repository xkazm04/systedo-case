/** Pure, framework-free helpers shared by the Katalog manager and its extracted
 *  OfferingCard: the search predicate, the per-field draft→value parsers used when a
 *  card commits on blur, and the shared input class. No React import, so these are unit-
 *  testable in node and safe to reuse across the client components. */
import type { Offering } from "@/lib/catalog/offering";

/** Diacritic- and case-insensitive normalization so a cs search ("kesu") matches
 *  "Kešu" and an en search matches either. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Does an offering match a free-text query? Searches the fields a user would type:
 *  name, category, tags, and (products) sku + gtin. An empty query matches everything,
 *  so the list is identical to the un-searched view. */
export function offeringMatchesQuery(o: Offering, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const hay = [o.name, o.category, ...o.tags];
  if (o.kind === "product") hay.push(o.sku, o.gtin ?? "");
  return hay.some((h) => normalizeText(h).includes(q));
}

/** Parse a numeric text input to a number clamped ≥ 0. Blank or invalid → fallback
 *  (so a half-typed "-" or "" doesn't corrupt the value). Accepts a comma decimal. */
export function parseNumInput(v: string, fallback = 0): number {
  if (v.trim() === "") return fallback;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Parse a percent field (0–100) to a margin fraction 0–1, or undefined when blank
 *  (margin is optional). Out-of-range values clamp into [0, 1]. */
export function parseMarginPct(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n)) return undefined;
  return Math.min(1, Math.max(0, n / 100));
}

/** The shared input styling both the card fields and the import panel use. */
export const INPUT_BASE =
  "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-navy-800 transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200";

/** Page size for the manager's "show N + load more" pagination, and the threshold
 *  below which the full list renders exactly as before (no truncation). */
export const CATALOG_PAGE_SIZE = 50;
