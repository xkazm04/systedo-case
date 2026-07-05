/** Unit tests for feed import (WMS/feed direction): parsing the three feed shapes
 *  (Heureka/Zboží XML, Google Shopping XML, CSV), mapping to product offerings, and
 *  the merge/diff — including that a re-import preserves margin/velocity/stock. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectFeedFormat,
  feedItemsToOfferings,
  parseFeed,
  parseFeedPrice,
  sourceForFormat,
} from "@/lib/catalog/feed";
import { mergeCatalog } from "@/lib/catalog/import.ts";

const HEUREKA = `<?xml version="1.0" encoding="utf-8"?>
<SHOP>
  <SHOPITEM>
    <ITEM_ID>ABC-1</ITEM_ID>
    <PRODUCTNAME><![CDATA[Kešu ořechy natural, 500 g]]></PRODUCTNAME>
    <DESCRIPTION>Skvělé &amp; zdravé</DESCRIPTION>
    <URL>https://shop.cz/p/abc-1</URL>
    <PRICE_VAT>249</PRICE_VAT>
    <MANUFACTURER>Mionelo</MANUFACTURER>
    <CATEGORYTEXT>Potraviny | Ořechy</CATEGORYTEXT>
    <EAN>8590000000001</EAN>
    <DELIVERY_DATE>0</DELIVERY_DATE>
  </SHOPITEM>
  <SHOPITEM>
    <ITEM_ID>ABC-2</ITEM_ID>
    <PRODUCTNAME>Mandle loupané, 1 kg</PRODUCTNAME>
    <PRICE_VAT>389,00</PRICE_VAT>
    <CATEGORYTEXT>Potraviny | Ořechy</CATEGORYTEXT>
    <DELIVERY_DATE>2026-07-20</DELIVERY_DATE>
  </SHOPITEM>
</SHOP>`;

const GOOGLE = `<?xml version="1.0"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel>
  <item>
    <g:id>G-1</g:id>
    <g:title>Chia semínka 500 g</g:title>
    <g:price>149.00 CZK</g:price>
    <g:availability>in stock</g:availability>
    <g:brand>Mionelo</g:brand>
    <g:gtin>8590000000002</g:gtin>
    <g:google_product_category>Food</g:google_product_category>
    <g:link>https://shop.cz/p/g-1</g:link>
  </item>
  <item>
    <g:id>G-2</g:id>
    <g:title>Goji 250 g</g:title>
    <g:price>189 CZK</g:price>
    <g:availability>out of stock</g:availability>
  </item>
</channel></rss>`;

const CSV = `sku;název;cena;kategorie;ean;sklad;dostupnost
"CSV-1";"Vlašské ořechy, půlky";199,00;Ořechy;8590000000003;73;skladem
CSV-2;"Dýňová ""natural"" semínka";129;Semínka;;6;1`;

test("parseFeedPrice handles cs/int/decimal/thousands formatting", () => {
  assert.equal(parseFeedPrice("249"), 249);
  assert.equal(parseFeedPrice("389,00"), 389);
  assert.equal(parseFeedPrice("149.00 CZK"), 149);
  assert.equal(parseFeedPrice("1 299,00 Kč"), 1299);
  assert.equal(parseFeedPrice("1.299,00"), 1299);
  assert.equal(parseFeedPrice(undefined), 0);
});

test("detectFeedFormat recognizes each shape", () => {
  assert.equal(detectFeedFormat(HEUREKA), "heureka");
  assert.equal(detectFeedFormat(GOOGLE), "google");
  assert.equal(detectFeedFormat(CSV), "csv");
  assert.equal(detectFeedFormat("<html><body>nope</body></html>"), null);
});

test("Heureka XML: CDATA/entities decoded, availability from DELIVERY_DATE", () => {
  const { format, items } = parseFeed(HEUREKA);
  assert.equal(format, "heureka");
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "ABC-1");
  assert.equal(items[0].title, "Kešu ořechy natural, 500 g");
  assert.equal(items[0].price, 249);
  assert.equal(items[0].ean, "8590000000001");
  assert.equal(items[0].brand, "Mionelo");
  assert.equal(items[0].inStock, true); // DELIVERY_DATE 0
  assert.equal(items[1].price, 389); // comma decimal
  assert.equal(items[1].inStock, false); // a future date
});

test("Google XML: g: namespace, price currency stripped, availability", () => {
  const { format, items } = parseFeed(GOOGLE);
  assert.equal(format, "google");
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "G-1");
  assert.equal(items[0].price, 149);
  assert.equal(items[0].category, "Food");
  assert.equal(items[0].gtin ?? items[0].ean, "8590000000002");
  assert.equal(items[0].inStock, true);
  assert.equal(items[1].inStock, false);
  assert.equal(sourceForFormat("google"), "merchant-center");
});

test("CSV: quote-aware, escaped quotes, semicolon delimiter, cs headers", () => {
  const { format, items } = parseFeed(CSV);
  assert.equal(format, "csv");
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "CSV-1");
  assert.equal(items[0].title, "Vlašské ořechy, půlky"); // comma inside quotes kept
  assert.equal(items[0].price, 199);
  assert.equal(items[0].stock, 73);
  assert.equal(items[0].inStock, true); // "skladem"
  assert.equal(items[1].title, 'Dýňová "natural" semínka'); // "" unescaped
  assert.equal(items[1].stock, 6);
  assert.equal(sourceForFormat("csv"), "feed");
});

test("feedItemsToOfferings maps to product offerings with feed-known fields", () => {
  const { items } = parseFeed(HEUREKA);
  const offs = feedItemsToOfferings(items, "proj", "feed", "2026-07-05T00:00:00.000Z");
  assert.equal(offs.length, 2);
  assert.equal(offs[0].kind, "product");
  assert.equal(offs[0].sku, "ABC-1");
  assert.equal(offs[0].id, "proj:ABC-1");
  assert.equal(offs[0].active, true);
  assert.equal(offs[0].source, "feed");
  assert.equal(offs[0].gtin, "8590000000001");
  assert.equal(offs[1].active, false); // out of stock
  assert.equal(offs[1].stock, 0); // unknown from feed
});

const NOW = "2026-07-05T12:00:00.000Z";
const existing = (sku, over = {}) => ({
  kind: "product", id: `proj:${sku}`, projectId: "proj", name: `Old ${sku}`, category: "Old",
  active: true, nature: "online", price: 100, currency: "CZK", margin: 0.3, channels: ["Sklik"],
  tags: ["ruční"], source: "manual", updatedAt: "2026-01-01T00:00:00.000Z",
  sku, stock: 100, dailyVelocity: 2, ...over,
});

test("mergeCatalog: merge adds new, updates matches, preserves margin/velocity/stock", () => {
  const current = [existing("ABC-1"), existing("MAN-9")];
  const incoming = [
    { ...existing("ABC-1", { name: "Kešu 500 g", price: 259, stock: 0 }), source: "feed" },
    { ...existing("ABC-3", { name: "Nový produkt", price: 300 }), source: "feed" },
  ];
  const { next, diff } = mergeCatalog(current, incoming, "merge", NOW);
  assert.equal(diff.added, 1);
  assert.equal(diff.updated, 1);
  assert.equal(diff.removed, 0);

  const abc1 = next.find((o) => o.sku === "ABC-1");
  assert.equal(abc1.name, "Kešu 500 g"); // feed wins
  assert.equal(abc1.price, 259);
  assert.equal(abc1.margin, 0.3); // preserved
  assert.equal(abc1.dailyVelocity, 2); // preserved
  assert.equal(abc1.stock, 100); // feed stock 0 didn't overwrite the real count
  assert.equal(abc1.updatedAt, NOW);
  assert.ok(next.find((o) => o.sku === "MAN-9"), "manual product kept under merge");
});

test("mergeCatalog: replace drops products absent from the feed; feed self-dedupes", () => {
  const current = [existing("ABC-1"), existing("MAN-9")];
  const incoming = [
    { ...existing("ABC-1", { price: 259 }), source: "feed" },
    { ...existing("ABC-1", { price: 259 }), source: "feed" }, // duplicate key
  ];
  const { next, diff } = mergeCatalog(current, incoming, "replace", NOW);
  assert.equal(diff.updated, 1); // dedup → counted once
  assert.equal(diff.removed, 1); // MAN-9 dropped
  assert.ok(!next.find((o) => o.sku === "MAN-9"));
  assert.equal(next.length, 1);
});

test("non-product offerings are untouched by a product-feed import", () => {
  const plan = { kind: "plan", id: "proj:pro", projectId: "proj", name: "Pro", category: "Předplatné",
    active: true, nature: "online", price: 490, currency: "CZK", channels: [], tags: [],
    source: "manual", updatedAt: NOW, interval: "month", competitors: [], differentiators: [] };
  const { next } = mergeCatalog([plan], [{ ...existing("ABC-1"), source: "feed" }], "replace", NOW);
  assert.ok(next.find((o) => o.kind === "plan" && o.id === "proj:pro"), "plan survives replace");
});
