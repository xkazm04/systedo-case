/** Direction 2 — the catalog's revenue-weighted blended gross margin: the pure
 *  derivation that feeds the cost-model editor's "z katalogu" default. Exercises
 *  the price×velocity weighting, the CATEGORY_MARGINS fallback, and the null cases.
 *  Runs the TS source directly via the shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogBlendedMargin } from "@/lib/catalog/blended-margin";
import { CATEGORY_MARGINS, CATEGORY_FALLBACK_MARGIN } from "@/lib/margins";

const product = (o) => ({
  kind: "product",
  id: o.sku,
  projectId: "p",
  name: o.sku,
  category: o.category ?? "Ořechy",
  active: true,
  nature: "online",
  price: o.price ?? 100,
  currency: "CZK",
  channels: [],
  tags: [],
  source: "manual",
  updatedAt: "x",
  sku: o.sku,
  stock: o.stock ?? 10,
  dailyVelocity: o.dailyVelocity ?? 1,
  ...(o.margin !== undefined ? { margin: o.margin } : {}),
});

test("weights per-SKU margin by price × dailyVelocity (revenue proxy)", () => {
  // A: margin .2, weight 100×1 = 100 ; B: margin .5, weight 100×3 = 300
  // blended = (.2×100 + .5×300) / 400 = (20 + 150)/400 = 0.425
  const m = catalogBlendedMargin([
    product({ sku: "A", price: 100, dailyVelocity: 1, margin: 0.2 }),
    product({ sku: "B", price: 100, dailyVelocity: 3, margin: 0.5 }),
  ]);
  assert.ok(Math.abs(m - 0.425) < 1e-9);
});

test("a higher-priced fast-mover pulls the blend toward its own margin", () => {
  // cheap slow SKU vs expensive fast SKU — blend should sit near the big earner.
  const m = catalogBlendedMargin([
    product({ sku: "CHEAP", price: 10, dailyVelocity: 0.5, margin: 0.1 }),
    product({ sku: "HERO", price: 500, dailyVelocity: 5, margin: 0.4 }),
  ]);
  assert.ok(m > 0.39 && m <= 0.4, `expected near 0.4, got ${m}`);
});

test("falls back to CATEGORY_MARGINS per SKU when a margin is absent", () => {
  // single SKU, no explicit margin, category Semínka → its category margin exactly.
  const m = catalogBlendedMargin([product({ sku: "S", category: "Semínka", price: 100, dailyVelocity: 2 })]);
  assert.equal(m, CATEGORY_MARGINS["Semínka"]);
});

test("unknown category with no margin falls back to CATEGORY_FALLBACK_MARGIN", () => {
  const m = catalogBlendedMargin([product({ sku: "Z", category: "Neznámo", price: 50, dailyVelocity: 1 })]);
  assert.equal(m, CATEGORY_FALLBACK_MARGIN);
});

test("null when the catalog has no product offerings", () => {
  assert.equal(catalogBlendedMargin([]), null);
  assert.equal(
    catalogBlendedMargin([
      { kind: "service", id: "svc", projectId: "p", name: "S", category: "c", active: true, nature: "local", price: 0, currency: "CZK", channels: [], tags: [], source: "manual", updatedAt: "x", priceModel: "quote", serviceAreas: [] },
    ]),
    null
  );
});

test("null when no SKU is revenue-bearing (all price or velocity zero)", () => {
  const m = catalogBlendedMargin([
    product({ sku: "NOVEL", price: 0, dailyVelocity: 5, margin: 0.4 }),
    product({ sku: "DEAD", price: 200, dailyVelocity: 0, margin: 0.4 }),
  ]);
  assert.equal(m, null);
});

test("ignores zero-weight SKUs but still blends the revenue-bearing ones", () => {
  // DEAD (velocity 0) contributes nothing; only LIVE counts → its own margin.
  const m = catalogBlendedMargin([
    product({ sku: "DEAD", price: 200, dailyVelocity: 0, margin: 0.9 }),
    product({ sku: "LIVE", price: 100, dailyVelocity: 2, margin: 0.3 }),
  ]);
  assert.equal(m, 0.3);
});
