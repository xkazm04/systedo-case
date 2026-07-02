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

test("a legacy un-keyed doc is the ACTIVE period's data — nothing else's", () => {
  // Active 30d: legacy docs serve a 30d request…
  assert.equal(belongsToPeriod(null, "30d", "30d"), true);
  assert.equal(belongsToPeriod(undefined, "30d", "30d"), true);
  // …but never leak into a 7d view.
  assert.equal(belongsToPeriod(null, "30d", "7d"), false);
  // Before the first sync there is no active period to attribute them to.
  assert.equal(belongsToPeriod(null, null, "30d"), false);
});
