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

const asset = (text: string, max: number): Asset => ({ text: text.slice(0, max), len: text.length, max });

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

export function buildAssetGroup(p: Product): AssetGroup {
  const price = fmtCZK(p.price);
  const inStock = p.stock > 0;

  const headlines = clampList(
    [
      p.title,
      `${p.category} ${price}`,
      inStock ? "Skladem, expedice 24 h" : "Předobjednejte ihned",
      "Doprava zdarma nad 1 500 Kč",
      p.usps[0] ?? "Ověřená kvalita",
      p.usps[1] ?? "Oblíbená volba rodičů",
      `${p.category} Mionelo`,
      "Hodnocení 4,8/5 ★",
    ],
    RSA_HEADLINE_MAX,
    8
  );

  const longHeadlines = clampList(
    [
      `${p.title} — ${p.usps.slice(0, 2).join(", ")}`,
      `${p.category} Mionelo za ${price} s dopravou zdarma`,
    ],
    PMAX_LONG_HEADLINE_MAX,
    2
  );

  const descriptions = clampList(
    [
      `${p.title}. ${p.usps.slice(0, 2).join(", ")}. Doprava zdarma a vrácení do 30 dnů.`,
      `${p.usps.join(", ")}. ${inStock ? "Skladem, odesíláme do 24 hodin." : "Naskladnění brzy."}`,
    ],
    RSA_DESCRIPTION_MAX,
    2
  );

  return {
    sku: p.sku,
    finalUrl: `https://mionelo.cz/p/${p.sku.toLowerCase()}`,
    headlines,
    longHeadlines,
    descriptions,
  };
}
