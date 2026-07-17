/** Unit tests for the persisted per-SKU ad-copy model (src/lib/catalog/ad-copy.ts)
 *  and the catalog-wide CSV export (src/lib/catalog/export.ts):
 *   - persistence shape: upsert overwrites in place, caps oldest-off, sanitize bounds
 *     the untrusted client-echoed entry;
 *   - selection math: toggle + the batch cost/overwrite summary;
 *   - export composition: AI copy where persisted, deterministic floor elsewhere,
 *     labeled, over a uniform column grid. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeAdCopy,
  upsertAdCopy,
  adCopyForSku,
  adCopyBySku,
  toggleSelected,
  selectionSummary,
  adResultToGroup,
  composeCatalogAdCopy,
  adRequestForProduct,
  AD_COPY_SKU_CAP,
} from "@/lib/catalog/ad-copy.ts";
import { catalogAdCopyCsv } from "@/lib/catalog/export.ts";
import { buildAssetGroup } from "@/lib/catalog/generate.ts";

const result = (tag) => ({
  headlines: [`H1 ${tag}`, `H2 ${tag}`],
  descriptions: [`D1 ${tag}`],
  callouts: ["C1"],
  keywords: ["k1", "k2"],
  longHeadline: `Long ${tag}`,
  rationale: "because",
});

const entry = (sku, tag = sku, over = {}) => ({
  sku,
  result: result(tag),
  generatedAt: "2026-07-15T10:00:00.000Z",
  model: "gemini",
  demo: false,
  ...over,
});

const product = (sku, over = {}) => ({
  sku,
  title: `Title ${sku}`,
  category: "Ořechy",
  price: 249,
  stock: 10,
  dailyVelocity: 2,
  emoji: "🥜",
  usps: ["Bio", "Skladem"],
  ...over,
});

// ── persistence shape ────────────────────────────────────────────────────────
test("upsertAdCopy: a NEW sku prepends newest-first", () => {
  const s1 = upsertAdCopy(null, entry("A"));
  const s2 = upsertAdCopy(s1, entry("B"));
  assert.deepEqual(s2.items.map((i) => i.sku), ["B", "A"]);
});

test("upsertAdCopy: re-generating a sku OVERWRITES in place (no duplicate)", () => {
  const s1 = upsertAdCopy(null, entry("A", "old"));
  const s2 = upsertAdCopy(s1, entry("B"));
  const s3 = upsertAdCopy(s2, entry("A", "new"));
  // A moves to the front (freshest) and there is exactly one A, with the new copy.
  assert.deepEqual(s3.items.map((i) => i.sku), ["A", "B"]);
  assert.equal(adCopyForSku(s3, "A").result.headlines[0], "H1 new");
});

test("upsertAdCopy: caps oldest-off when a new sku exceeds the cap", () => {
  let s = null;
  for (const sku of ["A", "B", "C"]) s = upsertAdCopy(s, entry(sku), 2);
  // cap 2, added A,B,C → newest two kept (C,B), oldest (A) dropped.
  assert.deepEqual(s.items.map((i) => i.sku), ["C", "B"]);
  assert.equal(adCopyForSku(s, "A"), null);
});

test("AD_COPY_SKU_CAP is the catalog cap (500)", () => {
  assert.equal(AD_COPY_SKU_CAP, 500);
});

test("adCopyBySku: builds a sku→entry map", () => {
  const s = upsertAdCopy(upsertAdCopy(null, entry("A")), entry("B"));
  const map = adCopyBySku(s);
  assert.deepEqual(Object.keys(map).sort(), ["A", "B"]);
  assert.equal(map.A.sku, "A");
});

test("sanitizeAdCopy: forces the sku, bounds lists/strings, coerces the flags", () => {
  const raw = {
    sku: "SPOOFED", // ignored — sku forced from the argument
    result: {
      headlines: Array.from({ length: 40 }, (_, i) => `h${i}`), // → capped at 10
      descriptions: ["d", 99, null], // non-strings dropped
      callouts: ["c"],
      keywords: ["k"],
      longHeadline: "x".repeat(999), // → bounded to 300
      rationale: "ok",
    },
    generatedAt: "not-a-date",
    model: "gemini-2.5",
    demo: "truthy-string", // → coerced to false (only === true is demo)
  };
  const now = new Date("2026-07-16T00:00:00.000Z");
  const s = sanitizeAdCopy(raw, "REAL-SKU", now);
  assert.equal(s.sku, "REAL-SKU");
  assert.equal(s.result.headlines.length, 10);
  assert.deepEqual(s.result.descriptions, ["d"]);
  assert.equal(s.result.longHeadline.length, 300);
  assert.equal(s.generatedAt, now.toISOString(), "invalid date → now");
  assert.equal(s.demo, false);
  assert.equal(s.model, "gemini-2.5");
});

test("sanitizeAdCopy: empty model falls back to 'demo'", () => {
  const s = sanitizeAdCopy({ result: {}, demo: true }, "S");
  assert.equal(s.model, "demo");
  assert.equal(s.demo, true);
});

// ── selection math ───────────────────────────────────────────────────────────
test("toggleSelected: adds then removes", () => {
  assert.deepEqual(toggleSelected([], "A"), ["A"]);
  assert.deepEqual(toggleSelected(["A", "B"], "A"), ["B"]);
});

test("selectionSummary: count is the quota cost; existing vs fresh split", () => {
  const state = upsertAdCopy(null, entry("A"));
  const sum = selectionSummary(["A", "B", "C", "A"], state); // A duplicated → deduped
  assert.equal(sum.count, 3, "unique selection count = quota cost");
  assert.equal(sum.withExisting, 1, "A already has saved copy");
  assert.equal(sum.fresh, 2, "B and C are fresh");
});

test("selectionSummary: empty selection costs nothing", () => {
  assert.deepEqual(selectionSummary([], null), { count: 0, withExisting: 0, fresh: 0 });
});

// ── request payload ──────────────────────────────────────────────────────────
test("adRequestForProduct: grounds audience in category, falls back benefits", () => {
  const r = adRequestForProduct(product("A", { usps: [] }));
  assert.equal(r.product, "Title A");
  assert.equal(r.benefits, "Ořechy", "empty usps → category fallback (passes the validator)");
  assert.equal(r.audience, "Zákazníci se zájmem o ořechy");
  assert.equal(r.platform, "google");
  assert.equal(r.tone, "pratelsky");
});

// ── export composition ───────────────────────────────────────────────────────
test("composeCatalogAdCopy: AI where persisted, deterministic floor elsewhere", () => {
  const products = [product("A"), product("B")];
  const state = upsertAdCopy(null, entry("A"));
  const rows = composeCatalogAdCopy(products, state, "Brand", "shop.cz");
  assert.equal(rows.length, 2);
  const a = rows.find((r) => r.group.sku === "A");
  const b = rows.find((r) => r.group.sku === "B");
  assert.equal(a.source, "ai", "A has persisted AI copy");
  assert.equal(a.group.headlines[0].text, "H1 A", "AI headlines used");
  assert.equal(b.source, "floor", "B falls back to the deterministic floor");
  assert.ok(b.group.headlines.length > 0, "floor still produces a full group");
  assert.equal(a.meta.assetGroupName, "Title A");
});

test("catalogAdCopyCsv: one row per product, uniform grid, labeled Source column", () => {
  const products = [product("A"), product("B")];
  const state = upsertAdCopy(null, entry("A"));
  const rows = composeCatalogAdCopy(products, state, "Brand", "shop.cz");
  const csv = catalogAdCopyCsv(rows, "en");
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 3, "header + 2 product rows");
  assert.match(lines[0], /^Campaign,Ad group,Headline 1/, "wide header");
  assert.match(lines[0], /Final URL,Source$/, "trailing Source column");
  // The grid is uniform: the header width is the widest row's headline+description
  // count, so a narrow AI row is padded to match. The claim-free floor (no shop-
  // supplied shipping/rating) emits 5 unique headlines / 2 descriptions for product B,
  // wider than the 2-headline AI row A. Header = Campaign+Ad group + 5 H + 2 D + Final
  // URL + Source = 11.
  const headerCols = lines[0].split(",").length;
  assert.equal(headerCols, 11, "uniform grid sized to the widest (floor) row");
  assert.ok(csv.includes("Feed draft"), "floor row labeled (en)");
  assert.ok(/,AI\r?$/m.test(csv) || csv.includes(",AI\r\n") || csv.endsWith(",AI"), "AI-sourced row labeled in the Source column");
});

// ── deterministic floor: no fabricated claims ────────────────────────────────
test("buildAssetGroup: floor without claims asserts no shipping/rating/returns promise", () => {
  const g = buildAssetGroup(product("A"), "Brand", "shop.cz");
  const all = [...g.headlines, ...g.longHeadlines, ...g.descriptions].map((a) => a.text).join(" | ");
  assert.ok(!/Doprava zdarma/.test(all), "no free-shipping promise without a supplied threshold");
  assert.ok(!/Hodnocení/.test(all), "no rating claim without a supplied rating");
  assert.ok(!/vrácení do/.test(all), "no return-window claim without a supplied window");
  assert.ok(!/expedice \d/.test(all), "no dispatch-SLA claim without a supplied SLA");
  assert.ok(g.headlines.length > 0 && g.descriptions.length > 0, "still produces a full grounded group");
});

test("buildAssetGroup: supplied claims produce exactly the supplied promises", () => {
  const g = buildAssetGroup(product("A"), "Brand", "shop.cz", {
    freeShippingFrom: 1500,
    rating: 4.8,
    returnDays: 30,
    dispatchHours: 24,
  });
  const heads = g.headlines.map((a) => a.text);
  const descs = g.descriptions.map((a) => a.text).join(" | ");
  assert.ok(heads.some((h) => /Doprava zdarma nad/.test(h)), "free-shipping threshold headline present");
  assert.ok(heads.some((h) => h.includes("4,8/5")), "rating rendered with cs decimal comma");
  assert.ok(heads.some((h) => /expedice 24 h/.test(h)), "dispatch SLA reflects the supplied hours");
  assert.ok(/vrácení do 30 dnů/.test(descs), "return window reflects the supplied days");
});

test("buildAssetGroup: feed-declared availability overrides the stock-0 sentinel", () => {
  // A feed product the feed says is IN STOCK but with an unknown (0) count must read as
  // in-stock, not preorder.
  const inStockFeed = buildAssetGroup(product("A", { stock: 0, available: true }), "Brand", "shop.cz");
  const inTexts = [...inStockFeed.headlines, ...inStockFeed.descriptions].map((a) => a.text).join(" | ");
  assert.ok(inTexts.includes("Skladem"), "declared-available feed product reads as in stock");
  assert.ok(!/Předobjednejte|Naskladnění/.test(inTexts), "no preorder copy for an available product");

  const outFeed = buildAssetGroup(product("A", { stock: 0, available: false }), "Brand", "shop.cz");
  const outTexts = [...outFeed.headlines, ...outFeed.descriptions].map((a) => a.text).join(" | ");
  assert.ok(/Předobjednejte|Naskladnění/.test(outTexts), "declared-unavailable product reads as preorder");
});

test("adResultToGroup: folds an AdResult into the AssetGroup shape with char counts", () => {
  const g = adResultToGroup(result("Z"), product("A"), "shop.cz");
  assert.equal(g.sku, "A");
  assert.equal(g.finalUrl, "https://shop.cz/p/a");
  assert.equal(g.headlines[0].text, "H1 Z");
  assert.equal(g.headlines[0].max, 30);
  assert.equal(g.headlines[0].len, "H1 Z".length);
  assert.equal(g.longHeadlines.length, 1);
});
