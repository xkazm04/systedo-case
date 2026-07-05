/** Merge an imported product set into a project's catalog. Pure — the API route
 *  loads the current catalog, calls this to compute the next catalog + a preview
 *  diff, and persists on apply.
 *
 *  Field ownership (why a re-import is safe): a feed carries name/price/category/
 *  availability/gtin, NOT margins, sales velocity, exact stock, nature or channels —
 *  so a feed OVERWRITES the former and PRESERVES the latter. A warehouse/ERP source
 *  (Baselinker, ShipMonk, Skladon, ERP) IS authoritative for stock/velocity/margin,
 *  so it overwrites those too. Non-product offerings (plans/services) are untouched. */
import type { Offering, OfferingSource, ProductOffering } from "./offering";
import { isProduct } from "./offering";

/** Sources authoritative for warehouse-grade fields (stock, velocity, COGS margin). */
const WAREHOUSE_SOURCES = new Set<OfferingSource>(["baselinker", "shipmonk", "skladon", "erp"]);

export type ImportStrategy = "merge" | "replace";

export interface CatalogDiff {
  /** items in the incoming feed */
  incoming: number;
  added: number;
  updated: number;
  unchanged: number;
  /** existing products not present in the feed (dropped only when strategy=replace) */
  removed: number;
  sampleAdded: string[];
  sampleUpdated: string[];
}

const keyOf = (o: ProductOffering): string => o.sku || o.id;

/** The fields whose change counts as an "update" in the diff. */
function differs(a: ProductOffering, b: ProductOffering): boolean {
  return (
    a.name !== b.name ||
    a.price !== b.price ||
    a.category !== b.category ||
    a.active !== b.active ||
    (a.gtin ?? "") !== (b.gtin ?? "") ||
    a.stock !== b.stock ||
    a.dailyVelocity !== b.dailyVelocity ||
    (a.margin ?? -1) !== (b.margin ?? -1)
  );
}

/** Overlay an incoming offering onto an existing one. Both feed + warehouse win on
 *  name/price/category/availability/gtin; a warehouse/ERP source additionally owns
 *  stock/velocity/margin (it's authoritative), while a feed preserves those (its
 *  stock 0 = "unknown" never wipes a real count; its margin/velocity aren't trusted).
 *  Nature, channels, tags, restock and emoji are always kept from the existing row. */
function overlay(existing: ProductOffering, incoming: ProductOffering, now: string): ProductOffering {
  const authoritative = WAREHOUSE_SOURCES.has(incoming.source);
  return {
    ...existing,
    name: incoming.name,
    price: incoming.price,
    category: incoming.category,
    active: incoming.active,
    gtin: incoming.gtin ?? existing.gtin,
    stock: authoritative ? incoming.stock : incoming.stock > 0 ? incoming.stock : existing.stock,
    dailyVelocity:
      authoritative && incoming.dailyVelocity > 0 ? incoming.dailyVelocity : existing.dailyVelocity,
    margin: authoritative && incoming.margin != null ? incoming.margin : existing.margin,
    source: incoming.source,
    updatedAt: now,
  };
}

export interface MergeResult {
  next: Offering[];
  diff: CatalogDiff;
}

export function mergeCatalog(
  current: Offering[],
  incoming: ProductOffering[],
  strategy: ImportStrategy,
  now: string
): MergeResult {
  const nonProducts = current.filter((o): o is Exclude<Offering, ProductOffering> => !isProduct(o));
  const currentProducts = current.filter(isProduct);
  const byKey = new Map(currentProducts.map((p) => [keyOf(p), p]));

  const merged: ProductOffering[] = [];
  const incomingKeys = new Set<string>();
  const diff: CatalogDiff = {
    incoming: incoming.length,
    added: 0,
    updated: 0,
    unchanged: 0,
    removed: 0,
    sampleAdded: [],
    sampleUpdated: [],
  };

  for (const feed of incoming) {
    const k = keyOf(feed);
    if (incomingKeys.has(k)) continue; // de-dupe within the feed itself
    incomingKeys.add(k);
    const existing = byKey.get(k);
    if (!existing) {
      diff.added++;
      if (diff.sampleAdded.length < 5) diff.sampleAdded.push(feed.name);
      merged.push(feed);
    } else {
      const next = overlay(existing, feed, now);
      if (differs(existing, next)) {
        diff.updated++;
        if (diff.sampleUpdated.length < 5) diff.sampleUpdated.push(feed.name);
      } else {
        diff.unchanged++;
      }
      merged.push(next);
    }
  }

  const leftover = currentProducts.filter((p) => !incomingKeys.has(keyOf(p)));
  diff.removed = leftover.length;

  const next: Offering[] =
    strategy === "replace"
      ? [...nonProducts, ...merged]
      : [...nonProducts, ...merged, ...leftover];

  // "removed" only actually drops rows under replace; report 0 under merge.
  if (strategy === "merge") diff.removed = 0;

  return { next, diff };
}
