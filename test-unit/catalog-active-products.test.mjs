/** The catalog → legacy `Product[]` adapter seam (src/lib/catalog/offering.ts).
 *  `Product` has nowhere to carry the Katalog pause toggle, so a paused offering must
 *  be dropped AT the seam — otherwise ad generation and the catalog-wide export treat a
 *  deliberately paused SKU exactly like a live one. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isActiveProduct, toProduct, toProducts } from "@/lib/catalog/offering.ts";
import { composeCatalogAdCopy } from "@/lib/catalog/ad-copy.ts";

const offering = (over = {}) => ({
  kind: "product", id: "p:1", projectId: "p", name: "Kešu ořechy", category: "Ořechy",
  active: true, nature: "online", price: 249, currency: "CZK", channels: [], tags: ["bio"],
  source: "manual", updatedAt: "", sku: "LIVE-1", stock: 10, dailyVelocity: 1,
  ...over,
});

test("toProducts drops paused offerings, whatever the source", () => {
  const skus = toProducts([
    offering(),
    offering({ id: "p:2", sku: "PAUSED-1", active: false }),
    offering({ id: "p:3", sku: "PAUSED-FEED", source: "feed", active: false }),
    offering({ id: "p:4", sku: "PAUSED-MC", source: "merchant-center", active: false }),
    offering({ id: "p:5", sku: "LIVE-FEED", source: "feed", stock: 0 }),
    { kind: "plan", id: "pl:1", projectId: "p", name: "Pro", category: "Plán", active: true,
      nature: "online", price: 490, currency: "CZK", channels: [], tags: [], source: "manual",
      updatedAt: "", interval: "month", competitors: [], differentiators: [] },
  ]).map((p) => p.sku);
  assert.deepEqual(skus, ["LIVE-1", "LIVE-FEED"]);
});

test("isActiveProduct: only live product offerings", () => {
  assert.equal(isActiveProduct(offering()), true);
  assert.equal(isActiveProduct(offering({ active: false })), false);
});

test("toProduct keeps the legacy Product shape (no widening) and feed availability", () => {
  assert.equal("active" in toProduct(offering()), false, "the adapter contract is unchanged");
  assert.equal(toProduct(offering()).available, undefined, "non-feed sources stay stock-derived");
  assert.equal(toProduct(offering({ source: "feed", stock: 0 })).available, true);
});

test("the catalog-wide ad export skips paused products", () => {
  const products = toProducts([offering(), offering({ id: "p:2", sku: "PAUSED-1", active: false })]);
  const rows = composeCatalogAdCopy(products, null, "Brand", "shop.cz");
  assert.deepEqual(rows.map((r) => r.group.sku), ["LIVE-1"]);
});
