/** One honest catalog cap (MAX_OFFERINGS). The cap is applied at ONE boundary —
 *  mergeCatalog, on the MERGED (persisted) result — with an honest warning; the parser's
 *  ceiling (MAX_FEED_ITEMS) is a higher memory guard that no longer lies about "import".
 *  Pins: 499/500/501/2000 import shapes, merge-overflow, the "a PUT can't silently drop
 *  what the import kept" invariant, and the warning contents. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeCatalog } from "@/lib/catalog/import.ts";
import { sanitizeOfferings } from "@/lib/catalog/validate";
import { feedItemsToOfferings, parseFeed, sourceForFormat } from "@/lib/catalog/feed";
import { isProduct, MAX_FEED_ITEMS, MAX_OFFERINGS } from "@/lib/catalog/offering.ts";

const NOW = "2026-07-16T12:00:00.000Z";

const prod = (sku, over = {}) => ({
  kind: "product", id: `proj:${sku}`, projectId: "proj", name: sku, category: "C",
  active: true, nature: "online", price: 10, currency: "CZK", channels: [], tags: [],
  source: "feed", updatedAt: NOW, sku, stock: 0, dailyVelocity: 0, ...over,
});
const feedOf = (n, prefix = "F") => Array.from({ length: n }, (_, i) => prod(`${prefix}-${i}`));

test("constants: the memory ceiling sits above the catalog cap", () => {
  assert.equal(MAX_OFFERINGS, 500);
  assert.ok(MAX_FEED_ITEMS > MAX_OFFERINGS, "feed ceiling must not pre-clip below the catalog cap");
});

test("499 SKU import into empty → all kept, no cap warning", () => {
  const { next, warnings } = mergeCatalog([], feedOf(499), "replace", NOW);
  assert.equal(next.length, 499);
  assert.deepEqual(warnings, []);
});

test("500 SKU import into empty → exactly the cap, no warning", () => {
  const { next, warnings } = mergeCatalog([], feedOf(500), "replace", NOW);
  assert.equal(next.length, 500);
  assert.deepEqual(warnings, []);
});

test("501 SKU import → capped to 500, 1 dropped, honest warning, diff.added corrected", () => {
  const { next, diff, warnings } = mergeCatalog([], feedOf(501), "replace", NOW);
  assert.equal(next.length, 500);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /1 /); // 1 dropped
  assert.match(warnings[0], /500/); // the limit
  assert.equal(diff.added, 500, "diff.added reflects what was actually persisted");
});

test("2000 SKU import → capped to 500, warning names the drop count", () => {
  const { next, diff, warnings } = mergeCatalog([], feedOf(2000), "replace", NOW);
  assert.equal(next.length, 500);
  assert.match(warnings[0], /1500/); // 2000 - 500
  assert.equal(diff.added, 500);
});

test("merge overflow is existing-first: curated rows survive, newest feed rows drop", () => {
  const existing = feedOf(400, "OLD").map((p) => ({ ...p, source: "manual" }));
  const feed = feedOf(300, "NEW"); // all brand-new SKUs
  const { next, diff, warnings } = mergeCatalog(existing, feed, "merge", NOW);

  assert.equal(next.length, MAX_OFFERINGS, "merged catalog trimmed to the cap");
  for (const p of existing) {
    assert.ok(next.find((o) => o.sku === p.sku), `existing ${p.sku} survives`);
  }
  assert.equal(diff.added, 100, "only 100 of the 300 new rows fit");
  assert.match(warnings[0], /200/); // 700 - 500 dropped

  // The invariant: a later PUT re-sanitize keeps ALL of what the import persisted —
  // the silent-drop asymmetry is gone.
  const afterPut = sanitizeOfferings(next, "proj", NOW);
  assert.equal(afterPut.length, next.length, "PUT sanitize does not drop any persisted row");
});

test("warning contents: count, limit, and the existing-first rule are all stated", () => {
  const { warnings } = mergeCatalog([], feedOf(510), "replace", NOW);
  assert.match(warnings[0], /10/); // dropped
  assert.match(warnings[0], /500/); // limit
  assert.match(warnings[0], /stávající/i); // rule: existing rows stay
});

test("parser no longer lies about a 2000-item feed (no truncation, no warning)", () => {
  const rows = ["sku;název;cena", ...Array.from({ length: 2000 }, (_, i) => `S-${i};Item ${i};10`)];
  const { items, warnings } = parseFeed(rows.join("\n"));
  assert.equal(items.length, 2000, "2000 < memory ceiling → parsed in full");
  assert.ok(!warnings.some((w) => /příliš velký|prvních/i.test(w)), "no truncation warning at 2000");
});

test("full import pipeline: a 2000-row feed sanitizes uncapped, then merge caps once", () => {
  const rows = ["sku;název;cena", ...Array.from({ length: 2000 }, (_, i) => `S-${i};Item ${i};10`)];
  const parsed = parseFeed(rows.join("\n"));
  const incoming = sanitizeOfferings(
    feedItemsToOfferings(parsed.items, "proj", sourceForFormat(parsed.format), NOW),
    "proj",
    NOW,
    { preserveActiveTriState: true, maxItems: MAX_FEED_ITEMS }
  ).filter(isProduct);
  assert.equal(incoming.length, 2000, "sanitize does not pre-clip below the catalog cap");
  const { next, warnings } = mergeCatalog([], incoming, "replace", NOW);
  assert.equal(next.length, MAX_OFFERINGS);
  assert.equal(warnings.length, 1);
});
