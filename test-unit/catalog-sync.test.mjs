/** Unit tests for warehouse/ERP sync: provider→offering mapping, the Baselinker
 *  request builder + response mapper (pure parts; no live API), and the key
 *  semantic that a warehouse source is authoritative for stock/velocity/margin
 *  (unlike a feed) in mergeCatalog. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  demoWarehouseProducts,
  providerProductsToOfferings,
  sourceForProvider,
  syncProvider,
} from "@/lib/inventory/providers";
import { buildBaselinkerRequest, mapBaselinkerProducts } from "@/lib/inventory/baselinker";
import { mergeCatalog } from "@/lib/catalog/import.ts";

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
