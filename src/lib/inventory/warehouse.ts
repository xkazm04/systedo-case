/** Direction 2 — warehouse connector-hub seam (PROTOTYPE).
 *
 *  A project can link a warehouse *source*: a multichannel hub (Baselinker), a
 *  3PL (ShipMonk, Skladon), or an ERP (POHODA, Money S3, HELIOS). Once linked, the
 *  Sklad & sezónnost module reads WAREHOUSE-GRADE product data — measured velocity,
 *  real restock/PO dates, per-SKU COGS margin — instead of the frozen storefront
 *  catalog. That's the depth a product feed (Direction 1) can't give.
 *
 *  Real integration: `warehouseConnectionFor` looks up the project's stored
 *  connection and `warehouseSnapshot` calls the provider API (Baselinker inventory
 *  endpoints / ShipMonk + Skladon REST / an ERP middleware). Here both return a
 *  deterministic demo snapshot so the module renders live-shaped data WITHOUT
 *  credentials — the seam is real, the bytes are illustrative. Everything the
 *  module consumes already flows through `Product[]`, so nothing downstream changes. */
import type { Product } from "@/lib/catalog/sample";

export type WarehouseKind = "hub" | "3pl" | "erp";

export interface WarehouseProviderMeta {
  id: string;
  label: string;
  kind: WarehouseKind;
  /** provider initials for the (logo-free) badge */
  mark: string;
  /** one-line positioning shown in the connector picker */
  blurb: string;
  blurbEn: string;
}

/** The connectable back-ends, grouped by kind. Ordered hub → 3PL → ERP: one hub
 *  covers the most ground, a 3PL is API-native, an ERP is where mid/large shops
 *  keep authoritative stock. */
export const WAREHOUSE_PROVIDERS: WarehouseProviderMeta[] = [
  { id: "baselinker", label: "Baselinker", kind: "hub", mark: "BL",
    blurb: "Multikanálový sklad + prodejní kanály přes jedno API",
    blurbEn: "Multichannel stock + sales channels through one API" },
  { id: "shipmonk", label: "ShipMonk", kind: "3pl", mark: "SM",
    blurb: "3PL fulfillment — zásoby a příjem v reálném čase",
    blurbEn: "3PL fulfillment — real-time stock and receiving" },
  { id: "skladon", label: "Skladon", kind: "3pl", mark: "SK",
    blurb: "České fulfillment centrum, oboustranná synchronizace",
    blurbEn: "Czech fulfillment centre, two-way sync" },
  { id: "pohoda", label: "POHODA", kind: "erp", mark: "PO",
    blurb: "Nejrozšířenější český ERP (Stormware)",
    blurbEn: "The most common Czech ERP (Stormware)" },
  { id: "money-s3", label: "Money S3", kind: "erp", mark: "M3",
    blurb: "Účetnictví + sklad, import dávkou nebo přes middleware",
    blurbEn: "Accounting + stock, batch import or via middleware" },
  { id: "helios", label: "HELIOS", kind: "erp", mark: "He",
    blurb: "ERP pro střední a velké e-shopy",
    blurbEn: "ERP for mid & large e-shops" },
];

export function warehouseProvider(id: string): WarehouseProviderMeta | undefined {
  return WAREHOUSE_PROVIDERS.find((p) => p.id === id);
}

export interface WarehouseConnection {
  provider: WarehouseProviderMeta;
  /** ISO timestamp of the last successful sync */
  syncedAt: string;
  /** minutes since the last sync, relative to the module's reference `now` */
  syncedMinsAgo: number;
}

export interface WarehouseSnapshot {
  connection: WarehouseConnection;
  /** warehouse-grade catalog — every SKU carries measured velocity, per-SKU
   *  margin and (where relevant) a real restock ETA from a purchase order */
  products: Product[];
  skuCount: number;
}

/** ISO YYYY-MM-DD `days` after a reference date (UTC). */
function isoAfter(now: Date, days: number): string {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The warehouse-grade catalog the hub would return. Unlike the 6-SKU storefront
 *  sample, this carries per-SKU COGS margin (retiring the fragile CATEGORY_MARGINS
 *  fallback), measured daily velocity, and PO-backed restock ETAs computed relative
 *  to `now` so the "resuming" ramp always lands inside the planning horizon. The
 *  extra SKUs reflect that a warehouse sees the whole catalog, not just what's live
 *  on the storefront feed. */
export function warehouseCatalog(now: Date): Product[] {
  return [
    { sku: "MIO-CASHEW-500", title: "Kešu ořechy natural, 500 g", category: "Ořechy",
      price: 249, stock: 48, dailyVelocity: 2.1, margin: 0.31, emoji: "🥜",
      usps: ["100% natural", "Bez soli a oleje"] },
    { sku: "MIO-ALMOND-1K", title: "Mandle loupané, 1 kg", category: "Ořechy",
      price: 389, stock: 9, dailyVelocity: 1.4, margin: 0.27, emoji: "🌰",
      usps: ["Kalifornské mandle", "Bohaté na vlákninu"],
      restockDate: isoAfter(now, 8), incomingQty: 80 },
    { sku: "MIO-CHIA-500", title: "Chia semínka, 500 g", category: "Semínka",
      price: 149, stock: 120, dailyVelocity: 1.0, margin: 0.41, emoji: "🫘",
      usps: ["Zdroj omega-3", "Původ Mexiko"] },
    { sku: "MIO-GOJI-250", title: "Goji sušené plody, 250 g", category: "Sušené plody",
      price: 189, stock: 4, dailyVelocity: 0.9, margin: 0.36, emoji: "🍒",
      usps: ["Bez přidaného cukru", "Antioxidanty"],
      restockDate: isoAfter(now, 5), incomingQty: 60 },
    { sku: "MIO-WALNUT-500", title: "Vlašské ořechy půlky, 500 g", category: "Ořechy",
      price: 199, stock: 73, dailyVelocity: 1.7, margin: 0.33, emoji: "🌰",
      usps: ["Čerstvá sklizeň", "Ručně tříděné"] },
    { sku: "MIO-PUMPKIN-500", title: "Dýňová semínka natural, 500 g", category: "Semínka",
      price: 129, stock: 6, dailyVelocity: 2.6, margin: 0.44, emoji: "🎃",
      usps: ["Zdroj hořčíku", "Ideální do müsli"],
      restockDate: isoAfter(now, 18), incomingQty: 120 },
    // SKUs the warehouse sees that the storefront feed alone wouldn't surface with
    // velocity + COGS:
    { sku: "MIO-BRAZIL-400", title: "Para ořechy natural, 400 g", category: "Ořechy",
      price: 219, stock: 15, dailyVelocity: 1.9, margin: 0.29, emoji: "🥥",
      usps: ["Zdroj selenu", "Bez konzervantů"],
      restockDate: isoAfter(now, 30), incomingQty: 90 },
    { sku: "MIO-FLAX-1K", title: "Lněné semínko zlaté, 1 kg", category: "Semínka",
      price: 159, stock: 210, dailyVelocity: 1.2, margin: 0.39, emoji: "🌾",
      usps: ["Vysoký obsah vlákniny", "Čerstvě balené"] },
    { sku: "MIO-CRANBERRY-300", title: "Brusinky sušené, 300 g", category: "Sušené plody",
      price: 139, stock: 33, dailyVelocity: 2.2, margin: 0.35, emoji: "🫐",
      usps: ["Bez oleje", "Jemně doslazené jablečnou šťávou"] },
  ];
}

/** The active warehouse connection for a project, or null if none is linked.
 *
 *  PROTOTYPE: demo projects (`demo-*`) present as connected to Baselinker so the
 *  module can show the payoff; a real project stays unlinked until credentials are
 *  supplied. Real integration replaces this with a store lookup + token check. */
export function warehouseConnectionFor(projectId: string, now: Date): WarehouseConnection | null {
  if (!projectId.startsWith("demo-")) return null;
  return demoWarehouseConnection(now);
}

/** A demo Baselinker connection, synced 6 minutes before the reference `now`. */
export function demoWarehouseConnection(now: Date): WarehouseConnection {
  const syncedMinsAgo = 6;
  const syncedAt = new Date(now.getTime() - syncedMinsAgo * 60_000).toISOString();
  return { provider: warehouseProvider("baselinker")!, syncedAt, syncedMinsAgo };
}

/** Assemble the warehouse snapshot for a connected project. */
export function warehouseSnapshot(connection: WarehouseConnection, now: Date): WarehouseSnapshot {
  const products = warehouseCatalog(now);
  return { connection, products, skuCount: products.length };
}
