/** Illustrative product feed for the demo e-shop (Mionelo — ořechy, semínka a
 *  superpotraviny, matching the case-study brand in performance.json / the
 *  article). Shared by the Produktová kreativa module (creative generation) and
 *  the Sklad & sezónnost module (stock pacing). Real-integration seam: replace
 *  with the Merchant Center / e-shop product feed. */

export interface Product {
  sku: string;
  title: string;
  category: string;
  /** price in CZK */
  price: number;
  /** units in stock */
  stock: number;
  /** average units sold per day */
  dailyVelocity: number;
  /** placeholder visual */
  emoji: string;
  /** selling points used to ground generated creative */
  usps: string[];
  /** illustrative gross-margin fraction (0–1); when omitted, derived by category */
  margin?: number;
  /** scheduled restock date (ISO YYYY-MM-DD) for a paused SKU, if any */
  restockDate?: string;
  /** units arriving on `restockDate` */
  incomingQty?: number;
}

export const SAMPLE_PRODUCTS: Product[] = [
  {
    sku: "MIO-CASHEW-500",
    title: "Kešu ořechy natural, 500 g",
    category: "Ořechy",
    price: 249,
    stock: 48,
    dailyVelocity: 2.1,
    emoji: "🥜",
    usps: ["100% natural", "Bez soli a oleje", "Doprava zdarma", "Skladem ihned"],
  },
  {
    sku: "MIO-ALMOND-1K",
    title: "Mandle loupané, 1 kg",
    category: "Ořechy",
    price: 389,
    stock: 9,
    dailyVelocity: 1.4,
    emoji: "🌰",
    usps: ["Kalifornské mandle", "Bohaté na vlákninu", "Znovuuzavíratelný sáček"],
  },
  {
    sku: "MIO-CHIA-500",
    title: "Chia semínka, 500 g",
    category: "Semínka",
    price: 149,
    stock: 120,
    dailyVelocity: 1.0,
    emoji: "🫘",
    usps: ["Zdroj omega-3", "Vysoký obsah vlákniny", "Původ Mexiko"],
  },
  {
    sku: "MIO-GOJI-250",
    title: "Goji sušené plody, 250 g",
    category: "Sušené plody",
    price: 189,
    stock: 4,
    dailyVelocity: 0.9,
    emoji: "🍒",
    usps: ["Bez přidaného cukru", "Sušené šetrně", "Antioxidanty"],
    // Paused (≈4 dní cover) but a restock lands within the horizon → "resuming".
    restockDate: "2026-06-20",
    incomingQty: 60,
  },
  {
    sku: "MIO-WALNUT-500",
    title: "Vlašské ořechy půlky, 500 g",
    category: "Ořechy",
    price: 199,
    stock: 73,
    dailyVelocity: 1.7,
    emoji: "🌰",
    usps: ["Čerstvá sklizeň", "Ručně tříděné", "Bez konzervantů"],
  },
  {
    sku: "MIO-PUMPKIN-500",
    title: "Dýňová semínka natural, 500 g",
    category: "Semínka",
    price: 129,
    stock: 6,
    dailyVelocity: 2.6,
    emoji: "🎃",
    usps: ["Zdroj hořčíku", "Bez soli", "Ideální do müsli"],
  },
];
