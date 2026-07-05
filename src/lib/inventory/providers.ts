/** Warehouse / ERP sync providers — the "live source" behind the catalog for stock,
 *  price and COGS (integration-backlog Phase D). A provider fetches its products; we
 *  normalize them to ProviderProduct[], then to ProductOffering[], then feed them
 *  through the same `mergeCatalog` the feed import uses. The `demo` provider returns
 *  the sample warehouse catalog (no credentials) so the sync is demonstrable; real
 *  providers (Baselinker first) are credential-gated. Framework-free (pure). */
import type { OfferingSource, ProductOffering } from "@/lib/catalog/offering";
import { warehouseCatalog } from "./warehouse";

/** A product as returned by a warehouse/ERP, normalized across providers. */
export interface ProviderProduct {
  externalId: string;
  sku: string;
  name: string;
  ean?: string;
  price: number;
  /** on-hand quantity (summed across warehouses when the provider splits it). */
  stock?: number;
  /** measured sales velocity — warehouses/ERPs may expose it; feeds don't. */
  dailyVelocity?: number;
  /** COGS gross-margin fraction 0–1, when the provider carries cost. */
  margin?: number;
  category?: string;
  brand?: string;
  restockDate?: string;
  incomingQty?: number;
}

export interface SyncProviderMeta {
  id: string;
  label: string;
  /** whether the provider needs an API token/credential to sync. */
  needsToken: boolean;
  /** whether this cycle actually implements the fetch (else "coming soon"). */
  implemented: boolean;
}

/** The providers offered in the sync picker: a credential-free demo, Baselinker
 *  (implemented, credential-gated), and the rest registered as coming-soon. */
export const SYNC_PROVIDERS: SyncProviderMeta[] = [
  { id: "demo", label: "Ukázkový sklad (demo)", needsToken: false, implemented: true },
  { id: "baselinker", label: "Baselinker", needsToken: true, implemented: true },
  { id: "shipmonk", label: "ShipMonk", needsToken: true, implemented: false },
  { id: "skladon", label: "Skladon", needsToken: true, implemented: false },
  { id: "pohoda", label: "POHODA", needsToken: true, implemented: false },
  { id: "money-s3", label: "Money S3", needsToken: true, implemented: false },
  { id: "helios", label: "HELIOS", needsToken: true, implemented: false },
];

export function syncProvider(id: string): SyncProviderMeta | undefined {
  return SYNC_PROVIDERS.find((p) => p.id === id);
}

/** The offering source a provider maps to (drives the authoritative-field merge). */
export function sourceForProvider(id: string): OfferingSource {
  switch (id) {
    case "baselinker":
    case "demo":
      return "baselinker";
    case "shipmonk":
      return "shipmonk";
    case "skladon":
      return "skladon";
    case "pohoda":
    case "money-s3":
    case "helios":
      return "erp";
    default:
      return "manual";
  }
}

/** The demo provider's products — the sample warehouse catalog (measured velocity,
 *  per-SKU COGS margin, PO-backed restock ETAs), so a sync is demonstrable without
 *  any credentials. */
export function demoWarehouseProducts(now: Date): ProviderProduct[] {
  return warehouseCatalog(now).map((p) => ({
    externalId: p.sku,
    sku: p.sku,
    name: p.title,
    price: p.price,
    stock: p.stock,
    dailyVelocity: p.dailyVelocity,
    margin: p.margin,
    category: p.category,
    restockDate: p.restockDate,
    incomingQty: p.incomingQty,
  }));
}

/** Map normalized provider products to product offerings. A warehouse/ERP source
 *  carries stock/velocity/margin, so the merge treats those as authoritative. */
export function providerProductsToOfferings(
  products: ProviderProduct[],
  projectId: string,
  source: OfferingSource,
  now: string
): ProductOffering[] {
  return products.map((p, i) => {
    const sku = (p.sku || p.externalId || `SYNC-${i + 1}`).slice(0, 80);
    return {
      kind: "product",
      id: `${projectId}:${sku}`,
      projectId,
      name: (p.name || sku).slice(0, 200),
      category: (p.category || "Sklad").slice(0, 120),
      active: p.stock == null || p.stock > 0,
      nature: "online",
      price: p.price,
      currency: "CZK",
      ...(p.margin != null ? { margin: p.margin } : {}),
      channels: [],
      tags: p.brand ? [p.brand.slice(0, 120)] : [],
      source,
      updatedAt: now,
      sku,
      stock: p.stock ?? 0,
      dailyVelocity: p.dailyVelocity ?? 0,
      ...(p.ean ? { gtin: p.ean.slice(0, 32) } : {}),
      ...(p.restockDate ? { restockDate: p.restockDate } : {}),
      ...(p.incomingQty != null ? { incomingQty: p.incomingQty } : {}),
    };
  });
}
