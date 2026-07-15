/** Direction 1 — the pure sync-over-sync change diff (src/lib/campaigns/store/
 *  snapshot-diff.ts), extracted verbatim from store/snapshots.getLatestChanges so the
 *  read-diet refactor (id-range reads + names riding on the snapshot instead of a
 *  second full campaign scan) can be pinned byte-for-byte without Firestore. Covers
 *  add/remove/change counting, the 5 % thresholds, status changes, the ≤6 cap +
 *  ordering, the optional CTR/CPC spine, legacy snake_case value, and name fallback. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffSnapshots } from "@/lib/campaigns/store/snapshot-diff";

const snap = (syncedAt, campaigns) => ({ syncedAt, campaigns });

test("added + removed: counts, names off entries, roas, ordering by value then cost", () => {
  const prev = snap("2026-07-01T00:00:00.000Z", [
    { campaignId: "1", name: "Alpha", status: "enabled", cost: 100, conversions: 10, conversionValue: 500 },
    { campaignId: "2", name: "Beta", status: "enabled", cost: 100, conversions: 5, conversionValue: 100 },
  ]);
  const cur = snap("2026-07-08T00:00:00.000Z", [
    { campaignId: "1", name: "Alpha", status: "enabled", cost: 100, conversions: 10, conversionValue: 500 },
    { campaignId: "3", name: "Gamma", status: "enabled", cost: 50, conversions: 4, conversionValue: 200 },
  ]);
  assert.deepEqual(diffSnapshots(prev, cur), {
    since: "2026-07-01T00:00:00.000Z",
    current: "2026-07-08T00:00:00.000Z",
    added: 1,
    removed: 1,
    changed: 0,
    items: [
      { campaignId: "3", name: "Gamma", kind: "added", costBefore: 0, costAfter: 50, costDelta: 1, valueDelta: 1, roasBefore: 0, roasAfter: 4 },
      { campaignId: "2", name: "Beta", kind: "removed", costBefore: 100, costAfter: 0, costDelta: -1, valueDelta: -1, roasBefore: 1, roasAfter: 0 },
    ],
  });
});

test("status change alone is a change; name falls back to id; legacy snake_case value + CTR/CPC spine", () => {
  const prev = snap("2026-07-01T00:00:00.000Z", [
    // No `name` (legacy) → id fallback; snake_case conversion_value; spine present.
    { campaignId: "1", status: "enabled", cost: 1000, conversions: 50, conversion_value: 5000, clicks: 200, impressions: 10000 },
  ]);
  const cur = snap("2026-07-08T00:00:00.000Z", [
    { campaignId: "1", status: "paused", cost: 1000, conversions: 50, conversionValue: 5000, clicks: 250, impressions: 10000 },
  ]);
  const out = diffSnapshots(prev, cur);
  assert.equal(out.changed, 1);
  assert.equal(out.added, 0);
  assert.equal(out.removed, 0);
  assert.deepEqual(out.items, [
    {
      campaignId: "1", name: "1", kind: "changed",
      costBefore: 1000, costAfter: 1000, costDelta: 0, valueDelta: 0,
      roasBefore: 5, roasAfter: 5,
      ctrBefore: 0.02, ctrAfter: 0.025, cpcBefore: 5, cpcAfter: 4,
    },
  ]);
});

test("the 5 % threshold gates a 'changed' — 4 % is quiet, 5 % fires, no spine → no ratio fields", () => {
  const mk = (cost) =>
    snap("2026-07-08T00:00:00.000Z", [
      { campaignId: "1", name: "A", status: "enabled", cost, conversions: 10, conversionValue: 1000 },
    ]);
  const base = snap("2026-07-01T00:00:00.000Z", [
    { campaignId: "1", name: "A", status: "enabled", cost: 100, conversions: 10, conversionValue: 1000 },
  ]);
  // +4 % cost, value unchanged → below threshold, nothing reported.
  assert.deepEqual(diffSnapshots(base, mk(104)).items, []);
  assert.equal(diffSnapshots(base, mk(104)).changed, 0);
  // +5 % cost → a change, and with no clicks/impressions the CTR/CPC fields are absent.
  const fired = diffSnapshots(base, mk(105));
  assert.equal(fired.changed, 1);
  assert.equal(fired.items.length, 1);
  assert.deepEqual(Object.keys(fired.items[0]).sort(), [
    "campaignId", "costAfter", "costBefore", "costDelta", "kind", "name", "roasAfter", "roasBefore", "valueDelta",
  ]);
});

test("the mover list is capped at 6 and ordered by cost when value deltas tie", () => {
  const cur = snap(
    "2026-07-08T00:00:00.000Z",
    [10, 20, 30, 40, 50, 60, 70, 80].map((cost, i) => ({
      campaignId: String(i), name: `C${i}`, status: "enabled", cost, conversions: 1, conversionValue: 100,
    }))
  );
  const out = diffSnapshots(snap("2026-07-01T00:00:00.000Z", []), cur);
  assert.equal(out.added, 8);
  assert.equal(out.items.length, 6); // capped
  // All added → |valueDelta| ties at 1; tiebreak is costAfter desc.
  assert.deepEqual(out.items.map((i) => i.costAfter), [80, 70, 60, 50, 40, 30]);
});
