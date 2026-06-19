/** Illustrative product feed for the demo e-shop (Mionelo — baby & kids gear).
 *  Shared by the Produktová kreativa module (creative generation) and the
 *  Sklad & sezónnost module (stock pacing). Real-integration seam: replace with
 *  the Merchant Center / e-shop product feed. */

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
    sku: "MIO-DRIFT3",
    title: "Kočárek Mionelo Drift 3v1",
    category: "Kočárky",
    price: 12990,
    stock: 48,
    dailyVelocity: 2.1,
    emoji: "🛒",
    usps: ["3v1 systém", "Hliníkový rám", "Doprava zdarma", "Skladem ihned"],
  },
  {
    sku: "MIO-LO-AUTO",
    title: "Autosedačka Mionelo Lo 0–13 kg",
    category: "Autosedačky",
    price: 3490,
    stock: 9,
    dailyVelocity: 1.4,
    emoji: "🚗",
    usps: ["i-Size certifikace", "Lehká 2,9 kg", "Vhodná od narození"],
  },
  {
    sku: "MIO-FLUX",
    title: "Jídelní židlička Mionelo Flux",
    category: "Židličky",
    price: 2290,
    stock: 120,
    dailyVelocity: 1.0,
    emoji: "🍽️",
    usps: ["Polohovatelná", "Snadné čištění", "Od 6 měsíců"],
  },
  {
    sku: "MIO-CUBE-BED",
    title: "Cestovní postýlka Mionelo Cube",
    category: "Postýlky",
    price: 1790,
    stock: 4,
    dailyVelocity: 0.9,
    emoji: "🛏️",
    usps: ["Skládací", "Taška v balení", "Moskytiéra"],
    // Paused (≈4 dní cover) but a restock lands within the horizon → "resuming".
    restockDate: "2026-06-20",
    incomingQty: 60,
  },
  {
    sku: "MIO-ESEN",
    title: "Chůvička Mionelo Esen",
    category: "Chůvičky",
    price: 1490,
    stock: 73,
    dailyVelocity: 1.7,
    emoji: "📷",
    usps: ["Full HD", "Noční vidění", "Obousměrná komunikace"],
  },
  {
    sku: "MIO-AMO-WRAP",
    title: "Nosítko Mionelo Amo",
    category: "Nosítka",
    price: 890,
    stock: 6,
    dailyVelocity: 2.6,
    emoji: "🎒",
    usps: ["Ergonomické", "4 pozice nošení", "Bavlna"],
  },
];
