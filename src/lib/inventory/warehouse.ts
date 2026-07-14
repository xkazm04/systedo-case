/** Direction 2 — warehouse connector-hub seam (PROTOTYPE).
 *
 *  A project can link a warehouse *source*: a multichannel hub (Baselinker), a
 *  3PL (ShipMonk, Skladon), or an ERP (POHODA, Money S3, HELIOS). Once linked, the
 *  Sklad & sezónnost module reads WAREHOUSE-GRADE product data — measured velocity,
 *  real restock/PO dates, per-SKU COGS margin — instead of the frozen storefront
 *  catalog. That's the depth a product feed (Direction 1) can't give.
 *
 *  Real integration: `warehouseConnectionFor` looks up the project's stored
 *  connection and `warehouseCatalog` returns the provider's inventory (Baselinker
 *  inventory endpoints / ShipMonk + Skladon REST / an ERP middleware). Here both
 *  return deterministic demo data so the module renders live-shaped data WITHOUT
 *  credentials — the seam is real, the bytes are illustrative. Everything the
 *  module consumes already flows through `Product[]`, so nothing downstream changes. */
import type { Product } from "@/lib/catalog/sample";
import type { StoredConnection } from "./connection-store";
import { providerDisplay } from "./providers";

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

/** Display metadata for a provider id — derived from the ONE registry (SYNC_PROVIDERS
 *  in providers.ts). The standalone WAREHOUSE_PROVIDERS list is retired; the picker's
 *  list is `warehouseDisplayProviders()` and a single provider is `warehouseProvider`. */
export function warehouseProvider(id: string): WarehouseProviderMeta | undefined {
  return providerDisplay(id);
}

/** Connection health, derived from the stored record's sync outcome. */
export type ConnectionHealth =
  /** last sync succeeded, no outstanding error */
  | "ok"
  /** the last sync failed (lastError set) — badge shows the failure */
  | "failing"
  /** connected but no successful sync yet */
  | "never-synced";

/** The connection BADGE — a derived view over the persisted StoredConnection (or an
 *  illustrative demo). Reduced to a derivation (Direction 1): no longer a second store
 *  of truth, just provider display + sync freshness + health computed from the record. */
export interface WarehouseConnection {
  provider: WarehouseProviderMeta;
  /** ISO timestamp of the last SUCCESSFUL sync, or null when never synced. */
  syncedAt: string | null;
  /** whole minutes since the last successful sync (relative to `now`), or null. */
  syncedMinsAgo: number | null;
  /** health derived from lastError / failCount / lastSyncAt. */
  health: ConnectionHealth;
  /** last failure message when `health === "failing"`. */
  lastError?: string;
  /** consecutive failure count (drives the failing badge). */
  failCount?: number;
  /** true for the illustrative demo badge (not a real stored connection). */
  demo: boolean;
}

/** A synthesized provider meta for an id missing from the registry — the badge stays
 *  honest (shows the raw id) rather than crashing on an unknown stored provider. */
function fallbackProvider(id: string): WarehouseProviderMeta {
  return { id, label: id, kind: "erp", mark: id.slice(0, 2).toUpperCase(), blurb: "", blurbEn: "" };
}

/** Derive the connection badge from a project's real StoredConnection (or null when the
 *  project has no linked warehouse). Pure — the page resolves the record server-side and
 *  threads this down. Health: a set `lastError` (with failCount > 0) ⇒ "failing"; else a
 *  present `lastSyncAt` ⇒ "ok"; else "never-synced". */
export function deriveWarehouseBadge(stored: StoredConnection | null, now: Date): WarehouseConnection | null {
  if (!stored) return null;
  const provider = warehouseProvider(stored.provider) ?? fallbackProvider(stored.provider);
  const lastSyncAt = stored.lastSyncAt ?? null;
  const failing = Boolean(stored.lastError) && (stored.failCount ?? 0) > 0;
  const health: ConnectionHealth = failing ? "failing" : lastSyncAt ? "ok" : "never-synced";
  const syncedMinsAgo =
    lastSyncAt != null ? Math.max(0, Math.floor((now.getTime() - Date.parse(lastSyncAt)) / 60_000)) : null;
  return {
    provider,
    syncedAt: lastSyncAt,
    syncedMinsAgo,
    health,
    ...(failing ? { lastError: stored.lastError, failCount: stored.failCount } : {}),
    demo: false,
  };
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

/** The ILLUSTRATIVE warehouse badge for a project, or null if none applies.
 *
 *  Demo projects (`demo-*`) present as connected to Baselinker so the module can show
 *  the payoff without credentials; the badge is flagged `demo` so the UI labels it
 *  honestly. A REAL project's badge is NOT derived here — the page resolves its stored
 *  connection server-side (getConnection → deriveWarehouseBadge), because that needs the
 *  signed-in userId and an async store read this pure helper can't do. */
export function warehouseConnectionFor(projectId: string, now: Date): WarehouseConnection | null {
  if (!projectId.startsWith("demo-")) return null;
  return demoWarehouseConnection(now);
}

/** A demo Baselinker badge, synced 6 minutes before the reference `now` (demo: true). */
export function demoWarehouseConnection(now: Date): WarehouseConnection {
  const syncedMinsAgo = 6;
  const syncedAt = new Date(now.getTime() - syncedMinsAgo * 60_000).toISOString();
  return {
    provider: warehouseProvider("baselinker")!,
    syncedAt,
    syncedMinsAgo,
    health: "ok",
    demo: true,
  };
}
