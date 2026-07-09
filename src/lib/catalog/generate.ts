/** Deterministic catalog → RSA/PMax asset-group builder. Turns a product feed
 *  row into Google Ads-compliant headlines + descriptions, respecting the RSA
 *  character limits, with a live char-count for each asset. Pure, no LLM — always
 *  works offline. Real-integration seam: swap `buildAssetGroup` for a call to the
 *  AI ads tool (/api/ai, mode "ads") for richer, on-brand copy. */
import type { Product } from "./sample";
import { fmtCZK } from "@/lib/format";

/** Google Ads Responsive Search Ad / PMax limits. */
export const RSA_HEADLINE_MAX = 30;
export const RSA_DESCRIPTION_MAX = 90;
export const PMAX_LONG_HEADLINE_MAX = 90;

export interface Asset {
  text: string;
  /** characters used / limit, so the UI can flag overflow */
  len: number;
  max: number;
}

export interface AssetGroup {
  sku: string;
  finalUrl: string;
  headlines: Asset[];
  longHeadlines: Asset[];
  descriptions: Asset[];
}

/** Truncate to `max` on a word boundary, adding an ellipsis only when actually
 *  cut — so an asset is never silently chopped mid-word and never exceeds the
 *  Google limit (Editor rejects over-limit assets at import). */
function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1); // leave room for the ellipsis
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return base.replace(/[\s.,;:–-]+$/, "") + "…";
}

/** Greedily join clauses with a space while the result stays within `max`,
 *  dropping clauses that don't fit — produces a complete, within-limit sentence
 *  (no mid-word cut), instead of authoring text that overflows and gets sliced. */
function packClauses(clauses: string[], max: number): string {
  let out = "";
  for (const c of clauses) {
    const next = out ? `${out} ${c}` : c;
    if (next.length <= max) out = next;
  }
  return out || fit(clauses[0] ?? "", max);
}

/** `len` is the FITTED length, so it is always ≤ max — the live char-count badge
 *  is honest (never shows a red over-limit count for copy we actually export). */
const asset = (text: string, max: number): Asset => {
  const t = fit(text, max);
  return { text: t, len: t.length, max };
};

function clampList(texts: string[], max: number, limit: number): Asset[] {
  // de-dupe, keep those within the limit first, then fill, cap at `limit`
  const seen = new Set<string>();
  const out: Asset[] = [];
  for (const t of texts) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(asset(t, max));
    if (out.length >= limit) break;
  }
  return out;
}

/** Deterministic keyless demo / fallback ad copy. `brand` + `domain` come from the
 *  project so the copy + final URL aren't hardcoded to one shop (BM-L1-02); both
 *  default to empty (brand dropped, neutral host) when unknown. */
export function buildAssetGroup(p: Product, brand = "", domain = ""): AssetGroup {
  const price = fmtCZK(p.price);
  const inStock = p.stock > 0;
  const withBrand = (s: string) => (brand ? `${s} ${brand}` : s);

  const headlines = clampList(
    [
      p.title,
      `${p.category} ${price}`,
      inStock ? "Skladem, expedice 24 h" : "Předobjednejte ihned",
      "Doprava zdarma nad 1 500 Kč",
      p.usps[0] ?? "Ověřená kvalita",
      p.usps[1] ?? "Oblíbená volba zákazníků",
      withBrand(p.category),
      "Hodnocení 4,8/5 ★",
    ],
    RSA_HEADLINE_MAX,
    8
  );

  const longHeadlines = clampList(
    [
      `${p.title} — ${p.usps.slice(0, 2).join(", ")}`,
      `${withBrand(p.category)} za ${price} s dopravou zdarma`,
    ],
    PMAX_LONG_HEADLINE_MAX,
    2
  );

  const descriptions = clampList(
    [
      packClauses(
        [`${p.title}.`, `${p.usps.slice(0, 2).join(", ")}.`, "Doprava zdarma, vrácení do 30 dnů."],
        RSA_DESCRIPTION_MAX
      ),
      packClauses(
        [`${p.usps.join(", ")}.`, inStock ? "Skladem, odesíláme do 24 hodin." : "Naskladnění brzy."],
        RSA_DESCRIPTION_MAX
      ),
    ],
    RSA_DESCRIPTION_MAX,
    2
  );

  return {
    sku: p.sku,
    finalUrl: `https://${domain || "www.example.com"}/p/${p.sku.toLowerCase()}`,
    headlines,
    longHeadlines,
    descriptions,
  };
}
