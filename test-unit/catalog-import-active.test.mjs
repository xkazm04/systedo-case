/** Regression: a feed that is SILENT on availability must not un-pause a manually
 *  paused SKU. Reproduces the old corruption (sanitize ran BEFORE merge and coerced the
 *  `active` tri-state undefined→true, silently re-activating every paused SKU and marking
 *  it "updated") and pins the fix: the import route now sanitizes with
 *  preserveActiveTriState, so mergeCatalog's overlay keeps the user's paused/active
 *  choice. Feeds WITH availability still override (documented field-ownership). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { feedItemsToOfferings, parseFeed, sourceForFormat } from "@/lib/catalog/feed";
import { sanitizeOfferings } from "@/lib/catalog/validate";
import { mergeCatalog } from "@/lib/catalog/import.ts";
import { isProduct } from "@/lib/catalog/offering.ts";

const NOW = "2026-07-16T12:00:00.000Z";

/** A CSV with NO dostupnost/availability column → the feed is silent on availability. */
const CSV_NO_AVAIL = `sku;název;cena;kategorie
ABC-1;Kešu ořechy;249;Ořechy`;

/** Same feed but WITH availability = in stock. */
const CSV_IN_STOCK = `sku;název;cena;kategorie;dostupnost
ABC-1;Kešu ořechy;249;Ořechy;skladem`;

/** An existing catalog row the user has manually paused, whose name/price/category
 *  already match what the feed carries so ONLY `active` could ever differ. */
const pausedExisting = () => ({
  kind: "product",
  id: "proj:ABC-1",
  projectId: "proj",
  name: "Kešu ořechy",
  category: "Ořechy",
  active: false, // manually paused by the user
  nature: "online",
  price: 249,
  currency: "CZK",
  margin: 0.3,
  channels: ["Sklik"],
  tags: [],
  source: "manual",
  updatedAt: "2026-01-01T00:00:00.000Z",
  sku: "ABC-1",
  stock: 100,
  dailyVelocity: 2,
});

/** The real import pipeline, parameterized by the sanitize tri-state option. */
function runImport(csv, current, { preserve }) {
  const parsed = parseFeed(csv);
  const incoming = sanitizeOfferings(
    feedItemsToOfferings(parsed.items, "proj", sourceForFormat(parsed.format), NOW),
    "proj",
    NOW,
    preserve ? { preserveActiveTriState: true } : undefined
  ).filter(isProduct);
  return mergeCatalog(current, incoming, "merge", NOW);
}

test("OLD corruption: without the tri-state option, a silent feed coerces active→true", () => {
  // Documents the bug: strict sanitize (the PUT default) turns the silent feed's
  // undefined availability into `true`, so the merge would flip the paused SKU on.
  const parsed = parseFeed(CSV_NO_AVAIL);
  const offs = feedItemsToOfferings(parsed.items, "proj", "feed", NOW);
  assert.equal(offs[0].active, undefined, "feed boundary keeps the tri-state undefined");
  const strict = sanitizeOfferings(offs, "proj", NOW).filter(isProduct);
  assert.equal(strict[0].active, true, "strict sanitize coerces the silence to active (the old trap)");
});

test("FIX: a silent feed leaves a manually-paused SKU paused, and does not flag it updated", () => {
  const { next, diff } = runImport(CSV_NO_AVAIL, [pausedExisting()], { preserve: true });
  const abc1 = next.find((o) => o.sku === "ABC-1");
  assert.equal(abc1.active, false, "paused SKU stays paused after a silent feed");
  assert.equal(diff.updated, 0, "unchanged-but-paused row is not flagged as updated");
  assert.equal(diff.unchanged, 1);
});

test("FIX: the tri-state survives sanitize into the merge", () => {
  const incoming = sanitizeOfferings(
    feedItemsToOfferings(parseFeed(CSV_NO_AVAIL).items, "proj", "feed", NOW),
    "proj",
    NOW,
    { preserveActiveTriState: true }
  ).filter(isProduct);
  assert.equal(incoming[0].active, undefined, "tri-state undefined reaches the merge boundary");
});

test("field-ownership preserved: a feed WITH availability still overrides the paused state", () => {
  const { next } = runImport(CSV_IN_STOCK, [pausedExisting()], { preserve: true });
  const abc1 = next.find((o) => o.sku === "ABC-1");
  assert.equal(abc1.active, true, "an explicit in-stock availability re-activates the SKU");
});

test("a brand-new SKU from a silent feed still defaults to active", () => {
  const { next, diff } = runImport(CSV_NO_AVAIL, [], { preserve: true });
  const abc1 = next.find((o) => o.sku === "ABC-1");
  assert.equal(diff.added, 1);
  assert.equal(abc1.active, true, "no existing row → default active");
});
