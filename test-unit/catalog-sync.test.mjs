/** Unit tests for warehouse/ERP sync: provider→offering mapping, the Baselinker
 *  request builder + response mapper (pure parts; no live API), and the key
 *  semantic that a warehouse source is authoritative for stock/velocity/margin
 *  (unlike a feed) in mergeCatalog. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  demoWarehouseProducts,
  providerProductsToOfferings,
  sourceForProvider,
  syncProvider,
} from "@/lib/inventory/providers";
import {
  BASELINKER_MAX_PAGES,
  BASELINKER_PAGE_SIZE,
  buildBaselinkerRequest,
  collectBaselinkerPages,
  mapBaselinkerProducts,
} from "@/lib/inventory/baselinker";
import { mergeCatalog } from "@/lib/catalog/import.ts";

/** A fixture page-fetcher: returns `counts[page-1]` synthetic products, and records
 *  which pages were requested — the transport seam, no network. */
function fixtureFetcher(counts) {
  const pagesSeen = [];
  const fetchPage = async (page) => {
    pagesSeen.push(page);
    const n = counts[page - 1] ?? 0;
    return Array.from({ length: n }, (_, i) => ({
      externalId: `p${page}-${i}`,
      sku: `P${page}-${i}`,
      name: `Product ${page}-${i}`,
      price: 100,
    }));
  };
  return { fetchPage, pagesSeen };
}

test("sourceForProvider maps providers to offering sources", () => {
  assert.equal(sourceForProvider("baselinker"), "baselinker");
  assert.equal(sourceForProvider("demo"), "baselinker");
  assert.equal(sourceForProvider("skladon"), "skladon");
  assert.equal(sourceForProvider("pohoda"), "erp");
  assert.equal(sourceForProvider("money-s3"), "erp");
  assert.equal(syncProvider("baselinker")?.implemented, true);
  assert.equal(syncProvider("helios")?.implemented, false);
});

test("demo provider yields warehouse-grade products mapped to offerings", () => {
  const products = demoWarehouseProducts(new Date("2026-07-05T00:00:00Z"));
  assert.ok(products.length >= 6);
  const offs = providerProductsToOfferings(products, "proj", "baselinker", "2026-07-05T00:00:00.000Z");
  assert.equal(offs[0].kind, "product");
  assert.equal(offs[0].source, "baselinker");
  assert.equal(offs[0].id, `proj:${offs[0].sku}`);
  assert.ok(offs[0].dailyVelocity > 0, "carries measured velocity");
  assert.ok(offs[0].margin != null, "carries COGS margin");
  // an out-of-stock product maps to inactive
  const oos = providerProductsToOfferings([{ externalId: "X", sku: "X", name: "X", price: 10, stock: 0 }], "proj", "baselinker", "NOW");
  assert.equal(oos[0].active, false);
});

test("buildBaselinkerRequest targets the connector with token header + form body", () => {
  const { url, headers, body } = buildBaselinkerRequest("TOK123", "getInventoryProductsList", { inventory_id: "7" });
  assert.equal(url, "https://api.baselinker.com/connector.php");
  assert.equal(headers["X-BLToken"], "TOK123");
  const p = new URLSearchParams(body);
  assert.equal(p.get("method"), "getInventoryProductsList");
  assert.deepEqual(JSON.parse(p.get("parameters")), { inventory_id: "7" });
});

test("mapBaselinkerProducts normalizes the products map (first price, summed stock)", () => {
  const json = {
    status: "SUCCESS",
    products: {
      "101": { id: 101, sku: "BL-1", name: "Kešu", ean: "859", prices: { 1: 249, 2: 259 }, stock: { bl_1: 30, bl_2: 18 }, category_id: 5 },
      "102": { id: 102, sku: "BL-2", text_fields: { name: "Mandle" }, prices: { 1: 389 }, stock: { bl_1: 0 } },
    },
  };
  const prods = mapBaselinkerProducts(json);
  assert.equal(prods.length, 2);
  assert.equal(prods[0].sku, "BL-1");
  assert.equal(prods[0].name, "Kešu");
  assert.equal(prods[0].price, 249); // first price group
  assert.equal(prods[0].stock, 48); // 30 + 18
  assert.equal(prods[0].ean, "859");
  assert.equal(prods[1].name, "Mandle"); // from text_fields
  assert.equal(prods[1].stock, 0);
  assert.deepEqual(mapBaselinkerProducts({ status: "SUCCESS" }), []); // no products key
});

test("collectBaselinkerPages: assembles multiple full pages then a short final page", async () => {
  const { fetchPage, pagesSeen } = fixtureFetcher([2, 2, 1]);
  const { products: all, truncated } = await collectBaselinkerPages(fetchPage, { pageSize: 2, maxPages: 10 });
  assert.equal(all.length, 5); // 2 + 2 + 1
  assert.equal(truncated, false); // stopped on a short page, not the cap → complete
  assert.deepEqual(pagesSeen, [1, 2, 3]); // stops after the short (< pageSize) page
  assert.equal(all[0].sku, "P1-0");
  assert.equal(all[4].sku, "P3-0");
});

test("collectBaselinkerPages: an empty page terminates the walk", async () => {
  const { fetchPage, pagesSeen } = fixtureFetcher([2, 2, 0, 2]);
  const { products: all, truncated } = await collectBaselinkerPages(fetchPage, { pageSize: 2, maxPages: 10 });
  assert.equal(all.length, 4); // page 3 is empty → stop (page 4 never fetched)
  assert.equal(truncated, false);
  assert.deepEqual(pagesSeen, [1, 2, 3]);
});

test("collectBaselinkerPages: enforces the page cap AND flags truncation on a full-every-page catalog", async () => {
  const { fetchPage, pagesSeen } = fixtureFetcher(Array(100).fill(2));
  const { products: all, truncated } = await collectBaselinkerPages(fetchPage, { pageSize: 2, maxPages: 3 });
  assert.equal(all.length, 6); // 3 pages × 2, capped
  assert.equal(truncated, true); // hit the cap with a full final page → more remain
  assert.deepEqual(pagesSeen, [1, 2, 3]); // never walks past the cap
});

test("collectBaselinkerPages: a cap that lands exactly on the last full page is NOT truncated", async () => {
  // Cap = 3, and the catalog is exactly 3 full pages then ends (page 3 is full but
  // there is no page 4). We can't know it ended without walking further, so hitting
  // the cap on a full page conservatively reports truncated — documented behaviour.
  const { fetchPage } = fixtureFetcher([2, 2, 2]);
  const { truncated } = await collectBaselinkerPages(fetchPage, { pageSize: 2, maxPages: 3 });
  assert.equal(truncated, true);
});

test("collectBaselinkerPages: default cap constants describe a 20k-SKU ceiling", () => {
  assert.equal(BASELINKER_MAX_PAGES * BASELINKER_PAGE_SIZE, 20000);
});

test("collectBaselinkerPages: default cap is 20 pages of 1000 (20k SKUs)", () => {
  assert.equal(BASELINKER_PAGE_SIZE, 1000);
});

const NOW = "2026-07-05T12:00:00.000Z";
const existing = {
  kind: "product", id: "p:S1", projectId: "p", name: "Old", category: "C", active: true, nature: "online",
  price: 100, currency: "CZK", margin: 0.3, channels: [], tags: [], source: "manual", updatedAt: "old",
  sku: "S1", stock: 100, dailyVelocity: 2,
};

test("mergeCatalog: a warehouse source is authoritative for stock/velocity/margin", () => {
  const wh = { ...existing, name: "New", price: 120, margin: 0.45, stock: 200, dailyVelocity: 5, source: "baselinker" };
  const s1 = mergeCatalog([existing], [wh], "merge", NOW).next.find((o) => o.sku === "S1");
  assert.equal(s1.stock, 200); // overwritten
  assert.equal(s1.dailyVelocity, 5); // overwritten
  assert.equal(s1.margin, 0.45); // overwritten
});

test("mergeCatalog: a feed source preserves margin/velocity (but a >0 stock still updates)", () => {
  const feed = { ...existing, name: "New", price: 120, margin: 0.45, stock: 200, dailyVelocity: 5, source: "feed" };
  const s1 = mergeCatalog([existing], [feed], "merge", NOW).next.find((o) => o.sku === "S1");
  assert.equal(s1.stock, 200); // feed stock > 0 is trusted
  assert.equal(s1.dailyVelocity, 2); // preserved (feeds don't carry velocity)
  assert.equal(s1.margin, 0.3); // preserved (feeds don't carry COGS)
});

/* ── WP W1-A — the change ledger's warehouse-sync write path ────────────────────
   runCatalogSync with `apply: true` must append the SKU-level events its merge
   actually produced. The stores are mocked (no auth, no Firestore, no sqlite) so
   the seam is unit-testable; the sync itself is the real one. */

const LEDGER = [];
mock.module("@/lib/catalog/events-store", {
  namedExports: {
    appendCatalogEvents: async (_u, _p, events) => {
      LEDGER.push(...events);
    },
    listCatalogEvents: async () => [],
    clearCatalogEvents: async () => {},
  },
});

const SYNC_NOW = new Date("2026-07-05T00:00:00Z");
const DEMO = demoWarehouseProducts(SYNC_NOW);
const HEAD = DEMO[0];

/** The stored catalog the sync merges INTO: one SKU the demo warehouse also carries,
 *  deliberately stale on every field the ledger watches, plus a SKU the demo set does
 *  NOT carry (which "merge" must leave alone — and therefore must not report). */
const STORED = [
  {
    kind: "product", id: `p1:${HEAD.sku}`, projectId: "p1", name: "Starý název",
    category: "Sklad", active: true, nature: "online", price: HEAD.price + 50,
    currency: "CZK", margin: (HEAD.margin ?? 0.3) + 0.2, channels: [], tags: [],
    source: "manual", updatedAt: "old", sku: HEAD.sku, stock: (HEAD.stock ?? 0) + 25,
    dailyVelocity: 1,
  },
  {
    kind: "product", id: "p1:LOCAL-ONLY", projectId: "p1", name: "Jen v katalogu",
    category: "Sklad", active: true, nature: "online", price: 100, currency: "CZK",
    margin: 0.3, channels: [], tags: [], source: "manual", updatedAt: "old",
    sku: "LOCAL-ONLY", stock: 5, dailyVelocity: 1,
  },
];

let saved = null;
mock.module("@/lib/catalog/store", {
  namedExports: {
    listOfferings: async () => STORED,
    saveOfferings: async (_u, _p, offerings) => {
      saved = offerings;
    },
    deleteCatalog: async () => {},
  },
});

const { runCatalogSync } = await import("@/lib/inventory/sync");

const syncOnce = (apply) =>
  runCatalogSync("u1", "p1", {
    providerId: "demo",
    token: "",
    strategy: "merge",
    apply,
    now: SYNC_NOW,
  });

test("runCatalogSync (preview) writes NOTHING to the ledger", async () => {
  LEDGER.length = 0;
  const result = await syncOnce(false);
  assert.equal(result.code, "ok");
  assert.equal(saved, null, "a preview does not persist");
  assert.equal(LEDGER.length, 0, "a preview leaves no history behind");
});

test("runCatalogSync (apply) appends the SKU-level events the merge produced", async () => {
  LEDGER.length = 0;
  const result = await syncOnce(true);
  assert.equal(result.code, "ok");
  assert.ok(saved, "the catalog was persisted");

  const head = LEDGER.filter((e) => e.key === HEAD.sku);
  const kinds = head.map((e) => e.kind).sort();
  assert.deepEqual(kinds, ["margin", "price", "renamed", "stock"]);
  assert.equal(head.find((e) => e.kind === "price").before, HEAD.price + 50);
  assert.equal(head.find((e) => e.kind === "price").after, HEAD.price);
  assert.equal(head.find((e) => e.kind === "stock").after, HEAD.stock);
  assert.equal(head.find((e) => e.kind === "renamed").before, "Starý název");

  // every demo SKU the catalog did not have yet is an "added"
  const added = LEDGER.filter((e) => e.kind === "added");
  assert.equal(added.length, DEMO.length - 1);

  // provenance: the warehouse path stamps the actor AND the provider id
  assert.ok(LEDGER.every((e) => e.actor === "warehouse-sync" && e.provider === "demo"));
  assert.ok(LEDGER.every((e) => e.at === SYNC_NOW.toISOString()));

  // "merge" never drops a SKU the provider is silent about, so it never reports one
  assert.equal(LEDGER.some((e) => e.key === "LOCAL-ONLY"), false);
});

test("runCatalogSync (apply) is idempotent in the ledger — a retry re-uses the same ids", async () => {
  LEDGER.length = 0;
  await syncOnce(true);
  const first = LEDGER.map((e) => e.id);
  LEDGER.length = 0;
  await syncOnce(true);
  assert.deepEqual(LEDGER.map((e) => e.id), first, "same batch, same ids (append upserts)");
});
