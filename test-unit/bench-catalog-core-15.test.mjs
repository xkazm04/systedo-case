/** Bench regression (catalog-core-15): a paused offering (`active: false`) must not
 *  flow into ad generation / the catalog-wide export. `toProduct` drops the `active`
 *  flag (mapping it only into `available`, and only for feed/merchant-center
 *  sources), so `loadProductsFor` returns paused products indistinguishable from
 *  live ones and `composeCatalogAdCopy` exports ad rows for products the user
 *  deliberately paused in Katalog. This test drives the real production pipeline
 *  (persisted catalog → loadProductsFor → composeCatalogAdCopy) and fails until
 *  paused offerings stop producing export rows — whether the fix filters at the
 *  load seam or carries `active` through and skips inactive rows in compose.
 *
 *  Run with --experimental-test-module-mocks (session + store are mocked so the
 *  server seam is unit-testable without auth/Firestore). */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const NOW = "2026-07-01T00:00:00.000Z";

/** A minimal valid ProductOffering. */
const offering = (sku, name, active, source = "manual") => ({
  kind: "product",
  id: `p1:${sku}`,
  projectId: "p1",
  name,
  category: "Ořechy",
  active,
  nature: "online",
  price: 249,
  currency: "CZK",
  margin: 0.3,
  channels: ["Sklik"],
  tags: ["čerstvé", "bez soli"],
  source,
  updatedAt: NOW,
  sku,
  stock: 100,
  dailyVelocity: 2,
});

const CATALOG = [
  offering("LIVE-1", "Kešu ořechy", true),
  offering("PAUSED-1", "Mandle loupané", false), // manually paused by the user
  offering("PAUSED-2", "Vlašské ořechy", false, "feed"), // paused, feed-sourced
];

mock.module("@/lib/session", { namedExports: { currentUserId: async () => "u-test" } });
mock.module("@/lib/catalog/store", {
  namedExports: {
    listOfferings: async () => CATALOG,
    saveOfferings: async () => {},
    deleteCatalog: async () => {},
  },
});

const { loadProductsFor } = await import("@/lib/catalog/load");
const { composeCatalogAdCopy } = await import("@/lib/catalog/ad-copy");

const project = {
  id: "p1",
  name: "Test",
  type: "eshop",
  accentColor: "#fff",
  createdAt: NOW,
  updatedAt: NOW,
};

test("control: an active product flows from the persisted catalog into the export", async () => {
  const products = await loadProductsFor(project, new Date(NOW));
  assert.ok(
    products.some((p) => p.sku === "LIVE-1"),
    "active persisted product reaches loadProductsFor"
  );
  const rows = composeCatalogAdCopy(products, null, "Brand", "shop.cz");
  assert.ok(
    rows.some((r) => r.group.sku === "LIVE-1"),
    "active product gets an export row"
  );
});

test("a paused (active:false) offering produces NO catalog-wide export row", async () => {
  // The real pipeline the export uses: loadProductsFor → composeCatalogAdCopy.
  const products = await loadProductsFor(project, new Date(NOW));
  const rows = composeCatalogAdCopy(products, null, "Brand", "shop.cz");
  const exportedSkus = rows.map((r) => r.group.sku);
  assert.ok(
    !exportedSkus.includes("PAUSED-1"),
    `a manually paused product must not be exported to Google Ads Editor (got rows for: ${exportedSkus.join(", ")})`
  );
  assert.ok(
    !exportedSkus.includes("PAUSED-2"),
    "a paused feed-sourced product must not be exported (paused is not 'preorder')"
  );
});
