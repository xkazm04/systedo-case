/** ad-edits (src/lib/ai/ad-edits.ts) — persistence for AdGenerator's in-place
 *  headline/description edits, keyed by the history entry's savedAt so a refresh
 *  or history-chip switch no longer discards hand-polished copy, and pruned to
 *  live history so the slot stays bounded. Pure — no React, no storage. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readEditedMap, nextEditedMap, editedFor } from "@/lib/ai/ad-edits";

const ad = (h) => ({ headlines: [h], descriptions: [], callouts: [], longHeadline: "" });

test("readEditedMap tolerates null and corrupt input", () => {
  assert.deepEqual(readEditedMap(null), {});
  assert.deepEqual(readEditedMap("not json"), {});
  assert.deepEqual(readEditedMap("[1,2]"), {}); // arrays are not a map
});

test("readEditedMap round-trips a stored map", () => {
  const map = { "100": ad("A") };
  assert.deepEqual(readEditedMap(JSON.stringify(map)), map);
});

test("nextEditedMap stores an edit under savedAt", () => {
  const out = nextEditedMap({}, 100, ad("A"), [100]);
  assert.deepEqual(out, { "100": ad("A") });
});

test("nextEditedMap drops the key when the edit is reverted (null)", () => {
  const out = nextEditedMap({ "100": ad("A") }, 100, null, [100]);
  assert.deepEqual(out, {});
});

test("nextEditedMap prunes keys no longer in history", () => {
  const map = { "100": ad("A"), "200": ad("B") };
  const out = nextEditedMap(map, 200, ad("B2"), [200]); // 100 fell out of history
  assert.deepEqual(out, { "200": ad("B2") });
});

test("nextEditedMap preserves other generations' edits", () => {
  const map = { "100": ad("A") };
  const out = nextEditedMap(map, 200, ad("B"), [100, 200]);
  assert.deepEqual(out, { "100": ad("A"), "200": ad("B") });
});

test("editedFor returns the stored edit or null", () => {
  const map = { "100": ad("A") };
  assert.deepEqual(editedFor(map, 100), ad("A"));
  assert.equal(editedFor(map, 999), null);
  assert.equal(editedFor(map, null), null);
});
