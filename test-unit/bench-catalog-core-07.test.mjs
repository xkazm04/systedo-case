/** Bench regression (catalog-core-07): the deterministic floor must not emit
 *  degenerate copy for a USP-less product (feed-imported rows commonly have
 *  tags: [] → usps: []). Today `${title} — ${usps.slice(0,2).join(", ")}` yields
 *  "Title — " and the description clauses pack a bare "." ("Title. .", ". Skladem.").
 *  This is exported copy (composeCatalogAdCopy's floor → Google Ads Editor CSV),
 *  not preview cosmetics. Correct behaviour: no dangling em-dash, no empty "."
 *  clause anywhere in the emitted assets. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAssetGroup } from "@/lib/catalog/generate.ts";

const product = (over = {}) => ({
  sku: "A",
  title: "Title A",
  category: "Ořechy",
  price: 249,
  stock: 10,
  dailyVelocity: 2,
  emoji: "🥜",
  usps: [],
  ...over,
});

const allAssets = (g) => [...g.headlines, ...g.longHeadlines, ...g.descriptions];

test("a USP-less product gets clean copy — no dangling em-dash, no empty clause", () => {
  const g = buildAssetGroup(product(), "Brand", "shop.cz");
  for (const a of allAssets(g)) {
    assert.ok(a.text.trim().length > 0, "no empty asset text");
    assert.ok(
      !/—\s*$/.test(a.text),
      `dangling em-dash in exported copy: ${JSON.stringify(a.text)}`
    );
    assert.ok(
      !/(^|\s)\.(\s|$)/.test(a.text),
      `empty "." clause in exported copy: ${JSON.stringify(a.text)}`
    );
  }
});

test("a product WITH USPs still interpolates them (no regression)", () => {
  const g = buildAssetGroup(product({ usps: ["Bio", "Skladem"] }), "Brand", "shop.cz");
  assert.ok(
    g.longHeadlines.some((a) => a.text.includes("Bio")),
    "USPs still reach the long headline"
  );
  for (const a of allAssets(g)) {
    assert.ok(!/—\s*$/.test(a.text), `dangling em-dash: ${JSON.stringify(a.text)}`);
    assert.ok(!/(^|\s)\.(\s|$)/.test(a.text), `empty clause: ${JSON.stringify(a.text)}`);
  }
});
