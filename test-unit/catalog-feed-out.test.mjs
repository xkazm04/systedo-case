/** WP W2-D — the OUTBOUND product feed serializers.
 *
 *  The oracle is the repo's OWN importer: every round-trip assertion runs `parseFeed`
 *  (src/lib/catalog/feed.ts — the parser that already reads real Heureka / Zboží /
 *  Merchant feeds) over what `feedOut` wrote. Nothing here compares the output against
 *  a second hand-written expectation of the same shape, which would only prove the two
 *  fixtures agree with each other.
 *
 *  Pure modules only — no db, no store, no mocks. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { feedOut, escapeXml, feedAvailable } = await import("@/lib/catalog/feed-out.ts");
const { feedLabels, marginBand } = await import("@/lib/catalog/feed-labels.ts");
const { parseFeed, detectFeedFormat } = await import("@/lib/catalog/feed.ts");
const { toProduct } = await import("@/lib/catalog/offering.ts");
const { stockRows } = await import("@/lib/inventory/compute.ts");

const NOW = new Date("2026-08-29T00:00:00Z");
const OPTS = { shopName: "Mionelo & spol.", shopUrl: "https://mionelo.cz", now: NOW };

const product = (over) => ({
  kind: "product",
  id: `p1:${over.sku}`,
  projectId: "p1",
  name: "Bez názvu",
  category: "Ořechy",
  active: true,
  nature: "online",
  price: 249,
  currency: "CZK",
  channels: [],
  tags: [],
  source: "manual",
  updatedAt: "2026-08-01T00:00:00.000Z",
  stock: 40,
  dailyVelocity: 1,
  ...over,
});

/** A: hand-written, high margin, healthy cover, XML-hostile name. */
const A = product({
  sku: "MIO-CASHEW-500",
  name: `Kešu & mandle <500 g> "natural" — Petr's`,
  category: "Ořechy",
  price: 249,
  stock: 48,
  dailyVelocity: 2.1,
  margin: 0.5,
  gtin: "8590000000003",
  tags: ["100% natural", "Bez soli a oleje"],
});

/** B: imported from a feed — stock 0 is the availability-feed sentinel, tags[0] is the
 *  manufacturer, and the price exercises the cs thousands-separator trap. */
const B = product({
  sku: "FEED-2",
  name: "Chia semínka, 1 kg",
  category: "Semínka",
  price: 1299,
  stock: 0,
  dailyVelocity: 0,
  source: "feed",
  tags: ["Mionelo"],
});

/** C: genuinely out of stock (a warehouse row with nothing on the shelf). */
const C = product({
  sku: "MIO-GOJI-250",
  name: "Goji, 250 g",
  category: "Sušené plody",
  price: 189,
  stock: 0,
  dailyVelocity: 1,
});

/** D: low cover — 15 days is under DAYS_LOW (21) and over DAYS_PAUSE (7). */
const D = product({
  sku: "MIO-DATE-500",
  name: "Datle Medjool, 500 g",
  category: "Sušené plody",
  price: 219,
  stock: 15,
  dailyVelocity: 1,
  margin: 0.1,
});

/** Paused — the Katalog toggle. Must never reach any feed. */
const PAUSED = product({ sku: "MIO-PAUSED", name: "Pozastaveno", active: false });

/** A plan offering — no availability, so not a product feed's business. */
const PLAN = {
  kind: "plan",
  id: "p1:plan",
  projectId: "p1",
  name: "Tarif Pro",
  category: "Tarify",
  active: true,
  nature: "online",
  price: 990,
  currency: "CZK",
  channels: [],
  tags: [],
  source: "manual",
  updatedAt: "2026-08-01T00:00:00.000Z",
  interval: "month",
  competitors: [],
  differentiators: [],
};

const CATALOG = [A, B, C, D, PAUSED, PLAN];

const byId = (items) => Object.fromEntries(items.map((i) => [i.id, i]));

// ---------------------------------------------------------------------------
// Round trip — the repo's own parser is the oracle, for all three formats.
// ---------------------------------------------------------------------------

test("google: parseFeed reads back every field feedOut wrote", () => {
  const xml = feedOut(CATALOG, "google", OPTS);

  assert.equal(detectFeedFormat(xml), "google", "the repo's own detector recognises the output");
  const parsed = parseFeed(xml);
  assert.equal(parsed.format, "google");
  assert.deepEqual(
    parsed.items.map((i) => i.id).sort(),
    ["FEED-2", "MIO-CASHEW-500", "MIO-DATE-500", "MIO-GOJI-250"],
    "live PRODUCTS only — the paused SKU and the plan are absent"
  );

  const items = byId(parsed.items);
  assert.equal(items["MIO-CASHEW-500"].title, A.name, "escaping round-trips & < > \" ' and diacritics");
  assert.equal(items["MIO-CASHEW-500"].price, 249);
  assert.equal(items["MIO-CASHEW-500"].category, "Ořechy");
  assert.equal(items["MIO-CASHEW-500"].ean, "8590000000003");
  assert.equal(items["MIO-CASHEW-500"].inStock, true);
  assert.equal(items["MIO-CASHEW-500"].description, "100% natural · Bez soli a oleje");
  assert.equal(items["MIO-CASHEW-500"].brand, undefined, "a hand-written offering states no brand");

  assert.equal(items["FEED-2"].price, 1299, "1299.00 is not read back as the cs '1.299' thousands shape");
  assert.equal(items["FEED-2"].brand, "Mionelo", "a feed-imported offering carries its manufacturer back out");
  assert.equal(items["FEED-2"].inStock, true, "an availability-feed row trusts the feed, not the sentinel 0 stock");
  assert.equal(items["FEED-2"].ean, undefined);

  assert.equal(items["MIO-GOJI-250"].inStock, false, "a warehouse row with 0 on the shelf is out of stock");
});

for (const format of ["heureka", "zbozi"]) {
  test(`${format}: parseFeed reads back every field feedOut wrote`, () => {
    const xml = feedOut(CATALOG, format, OPTS);

    assert.equal(detectFeedFormat(xml), "heureka", "both SHOPITEM feeds are read by the same parser");
    const parsed = parseFeed(xml);
    assert.deepEqual(
      parsed.items.map((i) => i.id).sort(),
      ["FEED-2", "MIO-CASHEW-500", "MIO-DATE-500"],
      "unavailable SKUs are omitted — DELIVERY_DATE has no truthful value for them"
    );

    const items = byId(parsed.items);
    assert.equal(items["MIO-CASHEW-500"].title, A.name);
    assert.equal(items["MIO-CASHEW-500"].price, 249);
    assert.equal(items["MIO-CASHEW-500"].category, "Ořechy");
    assert.equal(items["MIO-CASHEW-500"].ean, "8590000000003");
    assert.equal(items["MIO-CASHEW-500"].inStock, true, "DELIVERY_DATE 0 reads back as skladem");
    assert.equal(items["FEED-2"].price, 1299);
    assert.equal(items["FEED-2"].brand, "Mionelo");
  });
}

test("zbozi carries Zboží's own <PRODUCT> item name; heureka does not", () => {
  assert.match(feedOut(CATALOG, "zbozi", OPTS), /<PRODUCT>/);
  assert.equal(/<PRODUCT>/.test(feedOut(CATALOG, "heureka", OPTS)), false);
});

test("an empty catalog serves a VALID EMPTY feed, never an error", () => {
  for (const format of ["google", "heureka", "zbozi"]) {
    const xml = feedOut([], format, OPTS);
    assert.match(xml, /^<\?xml version="1\.0" encoding="utf-8"\?>/, `${format} declares its encoding`);
    const parsed = parseFeed(xml, format === "google" ? "google" : "heureka");
    assert.equal(parsed.items.length, 0, `${format}: zero items, and no throw`);
  }
  assert.match(feedOut([], "heureka", OPTS), /<SHOP>[\s\S]*<\/SHOP>/);
  assert.match(feedOut([], "google", OPTS), /<\/rss>/);
});

test("escapeXml is the exact inverse of the importer's decodeEntities", () => {
  assert.equal(escapeXml(`a & b < c > d " e ' f`), "a &amp; b &lt; c &gt; d &quot; e &apos; f");
  // The shop name reaches the RSS channel title through the same escaper.
  assert.match(feedOut([], "google", OPTS), /<title>Mionelo &amp; spol\.<\/title>/);
});

// ---------------------------------------------------------------------------
// Labels — pinned against stockRows / the margin ladder, never re-derived.
// ---------------------------------------------------------------------------

test("feedLabels: a 0.5-margin, healthy-cover product is marze-vysoka / sklad-ok", () => {
  const row = stockRows([toProduct(A)], NOW)[0];
  assert.equal(row.status, "ok", "the fixture really is an `ok` row per stockRows");
  assert.equal(row.margin, 0.5);
  assert.deepEqual(feedLabels(toProduct(A), NOW), { label0: "marze-vysoka", label1: "sklad-ok" });
});

test("feedLabels: a low-cover product is sklad-low, pinned to stockRows' own verdict", () => {
  const row = stockRows([toProduct(D)], NOW)[0];
  assert.equal(row.status, "low");
  assert.equal(feedLabels(toProduct(D), NOW).label1, `sklad-${row.status}`);
  assert.equal(feedLabels(toProduct(D), NOW).label0, "marze-nizka", "0.1 margin lands in the bottom band");
});

test("feedLabels: a category with no explicit margin falls to the shared CATEGORY table", () => {
  const row = stockRows([toProduct(B)], NOW)[0];
  assert.equal(row.margin, 0.38, "Semínka's shared margin (src/lib/margins.ts) reaches the label");
  assert.equal(feedLabels(toProduct(B), NOW).label0, "marze-stredni");
});

test("marginBand cutoffs", () => {
  assert.equal(marginBand(0.45), "marze-vysoka");
  assert.equal(marginBand(0.4499), "marze-stredni");
  assert.equal(marginBand(0.25), "marze-stredni");
  assert.equal(marginBand(0.2499), "marze-nizka");
});

test("labels reach all three documents under the same two names", () => {
  const google = feedOut(CATALOG, "google", OPTS);
  assert.match(google, /<g:custom_label_0>marze-vysoka<\/g:custom_label_0>/);
  assert.match(google, /<g:custom_label_1>sklad-ok<\/g:custom_label_1>/);
  for (const format of ["heureka", "zbozi"]) {
    const xml = feedOut(CATALOG, format, OPTS);
    assert.match(xml, /<PARAM><PARAM_NAME>custom_label_0<\/PARAM_NAME><VAL>marze-vysoka<\/VAL><\/PARAM>/);
    assert.match(xml, /<PARAM><PARAM_NAME>custom_label_1<\/PARAM_NAME><VAL>sklad-low<\/VAL><\/PARAM>/);
  }
});

test("feedAvailable: paused beats everything, then the feed's own word, then the shelf", () => {
  assert.equal(feedAvailable(PAUSED), false);
  assert.equal(feedAvailable(B), true, "source=feed + active → available despite stock 0");
  assert.equal(feedAvailable(C), false, "a manual row with stock 0 is honestly out of stock");
  assert.equal(feedAvailable(A), true);
});
