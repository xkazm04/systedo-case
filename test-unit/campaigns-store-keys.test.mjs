/** Per-period store keying (src/lib/campaigns/store-keys.ts): the doc-id scheme
 *  and the backward-compat attribution rule that lets pre-keying docs (no
 *  period field) keep serving the tenant's active period without ever leaking
 *  into another period's view. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  belongsToPeriod,
  campaignDocId,
  campaignSeriesDocId,
  seriesDocId,
  snapshotDocId,
  snapshotIdRange,
  isLegacySnapshotId,
} from "@/lib/campaigns/store-keys";

test("doc ids are period-prefixed and collision-free across periods", () => {
  assert.equal(campaignDocId("7d", "1001"), "7d_1001");
  assert.notEqual(campaignDocId("7d", "1001"), campaignDocId("30d", "1001"));
  assert.equal(seriesDocId("30d"), "30d");
  assert.equal(campaignSeriesDocId("90d"), "campaigns_90d");
  // None of the new ids can shadow the legacy singletons.
  assert.notEqual(seriesDocId("30d"), "latest");
  assert.notEqual(campaignSeriesDocId("30d"), "campaigns");
});

test("a period-keyed doc matches exactly its own period", () => {
  assert.equal(belongsToPeriod("7d", "30d", "7d"), true);
  assert.equal(belongsToPeriod("7d", "7d", "30d"), false);
});

test("snapshot ids are period-keyed, chronologically sortable, and range-scannable", () => {
  const a = snapshotDocId("7d", "2026-07-15T10:00:00.000Z");
  const b = snapshotDocId("7d", "2026-07-15T11:00:00.000Z");
  assert.equal(a, "7d__2026-07-15T10:00:00.000Z");
  // Within a period, lexicographic id order == chronological (fixed-width ISO).
  assert.ok(a < b);
  // Different periods never collide.
  assert.notEqual(snapshotDocId("7d", "2026-07-15T10:00:00.000Z"), snapshotDocId("30d", "2026-07-15T10:00:00.000Z"));

  // The id-range covers exactly one period's keyed ids and nothing else's.
  const { gte, lt } = snapshotIdRange("7d");
  assert.ok(gte <= a && a < lt);
  assert.ok(gte <= b && b < lt);
  // A different period's id falls outside the 7d range.
  const other = snapshotDocId("30d", "2026-07-15T10:00:00.000Z");
  assert.ok(other < gte || other >= lt);
});

test("legacy bare-ISO snapshot ids are told apart from keyed ones", () => {
  assert.equal(isLegacySnapshotId("2026-07-15T10:00:00.000Z"), true);
  assert.equal(isLegacySnapshotId(snapshotDocId("30d", "2026-07-15T10:00:00.000Z")), false);
  // Legacy ids sort below the keyed range floor, so a documentId<FLOOR scan finds them.
  const { gte } = snapshotIdRange("30d"); // "30d__" — the lexicographic floor of keyed ids
  assert.ok("2026-07-15T10:00:00.000Z" < gte);
});

test("a legacy un-keyed doc is the ACTIVE period's data — nothing else's", () => {
  // Active 30d: legacy docs serve a 30d request…
  assert.equal(belongsToPeriod(null, "30d", "30d"), true);
  assert.equal(belongsToPeriod(undefined, "30d", "30d"), true);
  // …but never leak into a 7d view.
  assert.equal(belongsToPeriod(null, "30d", "7d"), false);
  // Before the first sync there is no active period to attribute them to.
  assert.equal(belongsToPeriod(null, null, "30d"), false);
});
