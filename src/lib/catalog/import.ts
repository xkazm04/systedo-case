/** Merge an imported product set into a project's catalog. Pure — the API route
 *  loads the current catalog, calls this to compute the next catalog + a preview
 *  diff, and persists on apply.
 *
 *  Field ownership (why a re-import is safe): a feed carries name/price/category/
 *  availability/gtin, NOT margins, sales velocity, exact stock, nature or channels.
 *  So the feed OVERWRITES the former and PRESERVES the latter from the existing
 *  offering — re-importing a price feed never wipes a WMS stock count or a hand-set
 *  margin. Non-product offerings (plans/services) are never touched by a product feed. */
import type { Offering, ProductOffering } from "./offering";
import { isProduct } from "./offering";

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

/** The feed-owned fields whose change counts as an "update". */
function differs(a: ProductOffering, b: ProductOffering): boolean {
  return (
    a.name !== b.name ||
    a.price !== b.price ||
    a.category !== b.category ||
    a.active !== b.active ||
    (a.gtin ?? "") !== (b.gtin ?? "") ||
    a.stock !== b.stock
  );
}

/** Overlay a feed offering onto an existing one: feed wins on its owned fields;
 *  everything else (margin, velocity, nature, channels, tags, restock, emoji) is
 *  kept. A feed stock of 0 (unknown) never overwrites a real existing count. */
function overlay(existing: ProductOffering, feed: ProductOffering, now: string): ProductOffering {
  return {
    ...existing,
    name: feed.name,
    price: feed.price,
    category: feed.category,
    active: feed.active,
    gtin: feed.gtin ?? existing.gtin,
    stock: feed.stock > 0 ? feed.stock : existing.stock,
    source: feed.source,
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
