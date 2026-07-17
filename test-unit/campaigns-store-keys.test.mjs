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
  AFTER_ANY_ID,
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

test("the id-range upper bound sorts strictly above every real snapshot id (sentinel not stripped)", () => {
  // Regression guard: the range `lt` was once a literal, invisible Private-Use-Area
  // character embedded in source — any editor/linter/refactor that strips
  // non-printables would silently collapse gte===lt and return NOTHING. AFTER_ANY_ID
  // is now an explicit  escape; assert it is non-empty and that `lt` sorts
  // strictly above a maximal-looking id so a lost sentinel fails LOUDLY here.
  assert.ok(AFTER_ANY_ID.length > 0, "AFTER_ANY_ID sentinel must not be empty");
  const { gte, lt } = snapshotIdRange("7d");
  assert.ok(lt > gte, "range must be non-empty: lt must sort above gte");
  // A far-future, suffixed snapshot id (the largest realistic id) still falls below lt.
  const maxId = snapshotDocId("7d", "9999-12-31T23:59:59.999Z", "zzzzzzzz");
  assert.ok(maxId < lt, "every real snapshot id must sort below the range upper bound");
  assert.ok(maxId >= gte);
});

test("a per-sync suffix makes snapshot ids collision-proof while keeping chronological order", () => {
  const t = "2026-07-15T10:00:00.000Z";
  // Two syncs in the SAME millisecond used to share the bare-syncedAt id and clobber
  // each other; distinct suffixes give distinct, both-persisting ids.
  const a = snapshotDocId("7d", t, "aaaaaaaa");
  const b = snapshotDocId("7d", t, "bbbbbbbb");
  assert.notEqual(a, b);
  assert.equal(a, "7d__2026-07-15T10:00:00.000Z__aaaaaaaa");
  // syncedAt still dominates the sort; the suffix only breaks a same-ms tie.
  assert.ok(snapshotDocId("7d", "2026-07-15T09:00:00.000Z", "zzzzzzzz") < a);
  // Both suffixed ids still fall inside the period's id-range (reads find them).
  const { gte, lt } = snapshotIdRange("7d");
  assert.ok(gte <= a && a < lt && gte <= b && b < lt);
  // Still a keyed (non-legacy) id.
  assert.equal(isLegacySnapshotId(a), false);
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

test("PINNED legacy attribution: switching the active period can't steal legacy docs", () => {
  // Direction 2 fix — the second arg is now the PINNED legacyPeriod (recorded once),
  // not the live active period. Legacy docs were captured under 7d; the active period
  // later switched to 30d. They must still belong to 7d, NOT pollute the 30d timeline.
  const pinned = "7d";
  assert.equal(belongsToPeriod(null, pinned, "7d"), true); // still their own period
  assert.equal(belongsToPeriod(null, pinned, "30d"), false); // never leak into the new active one
  // A period-keyed doc is unaffected by the pin — it matches its own period exactly.
  assert.equal(belongsToPeriod("30d", pinned, "30d"), true);
});
