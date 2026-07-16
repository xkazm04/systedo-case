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
import { isProduct, MAX_OFFERINGS } from "./offering";

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
    // Preserve the user's active/paused state when the feed is silent on availability
    // (incoming.active === undefined), mirroring the stock/gtin "keep on unknown" guards
    // below. Only an explicit feed availability value overrides it.
    active: incoming.active ?? existing.active,
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
  /** Honest, user-facing notices about the merge — currently the catalog-cap notice
   *  when the merged result had to be trimmed to MAX_OFFERINGS. Empty when nothing was
   *  dropped. The route surfaces these alongside the parser's warnings. */
  warnings: string[];
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

  // Split matched (existing) rows from brand-new ones so the cap rule below is
  // "existing-first": on overflow we drop the NEWEST feed additions, never the user's
  // already-curated catalog.
  const matched: ProductOffering[] = [];
  const added: ProductOffering[] = [];
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
      // A brand-new product with no feed availability defaults to active.
      added.push(feed.active === undefined ? { ...feed, active: true } : feed);
    } else {
      const next = overlay(existing, feed, now);
      if (differs(existing, next)) {
        diff.updated++;
        if (diff.sampleUpdated.length < 5) diff.sampleUpdated.push(feed.name);
      } else {
        diff.unchanged++;
      }
      matched.push(next);
    }
  }

  const leftover = currentProducts.filter((p) => !incomingKeys.has(keyOf(p)));
  diff.removed = leftover.length;

  // Order matters for the cap: existing-derived rows first (non-products, matched
  // updates, then — under merge — untouched leftovers), brand-new feed rows last, so a
  // trim to MAX_OFFERINGS sheds the newest additions before any curated row.
  const next: Offering[] =
    strategy === "replace"
      ? [...nonProducts, ...matched, ...added]
      : [...nonProducts, ...matched, ...leftover, ...added];

  // "removed" only actually drops rows under replace; report 0 under merge.
  if (strategy === "merge") diff.removed = 0;

  // THE catalog cap, applied at THIS one boundary on the MERGED (persisted) result, so
  // the import can never persist more than a later PUT would keep. Honest warning: how
  // many were dropped and which rule.
  const warnings: string[] = [];
  if (next.length > MAX_OFFERINGS) {
    const dropped = next.length - MAX_OFFERINGS;
    // Dropped rows are the tail = newest additions first; reflect that in the diff count.
    const droppedAdded = Math.min(dropped, added.length);
    diff.added -= droppedAdded;
    next.length = MAX_OFFERINGS; // trim tail in place
    warnings.push(
      `Katalog by přesáhl limit ${MAX_OFFERINGS} položek; ${dropped} nejnovějších položek z feedu nebylo uloženo (stávající položky zůstávají).`
    );
  }

  return { next, diff, warnings };
}
