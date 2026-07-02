/** Weekly drift of the keyless sample campaigns (src/lib/campaigns/sample.ts):
 *  output must be byte-stable within one ISO week (so `hashEvalInputs` report
 *  caching holds between same-week re-syncs) yet drift across weeks with at
 *  least one campaign clearing the sync-over-sync diff's 5 % change threshold —
 *  otherwise the "Co se změnilo" panel and the change-aware alerts stay dead
 *  for every sample tenant. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isoWeekKey, sampleCampaigns } from "@/lib/campaigns/sample";
import { withMetrics, TARGET_ROAS } from "@/lib/campaigns/types";
import { triage } from "@/lib/campaigns/triage";

const DAY_MS = 86_400_000;
const MONDAY = Date.UTC(2026, 6, 6); // Mon 2026-07-06
const THURSDAY = MONDAY + 3 * DAY_MS; // Thu, same ISO week
const NEXT_MONDAY = MONDAY + 7 * DAY_MS;

/** Relative change, mirroring store.getLatestChanges' 5 % threshold input. */
const rel = (a, b) => (b > 0 ? (a - b) / b : a > 0 ? 1 : 0);

test("isoWeekKey buckets days of one week together and splits adjacent weeks", () => {
  assert.equal(isoWeekKey(new Date(MONDAY)), isoWeekKey(new Date(THURSDAY)));
  assert.notEqual(isoWeekKey(new Date(MONDAY)), isoWeekKey(new Date(NEXT_MONDAY)));
});

test("re-syncs within the same ISO week are byte-identical (report cache holds)", () => {
  assert.deepEqual(
    sampleCampaigns("30d", undefined, "mionelo", MONDAY),
    sampleCampaigns("30d", undefined, "mionelo", THURSDAY)
  );
});

test("consecutive weeks drift, with a campaign past the 5 % diff threshold", () => {
  for (let w = 0; w < 8; w++) {
    const before = sampleCampaigns("30d", undefined, "mionelo", MONDAY + w * 7 * DAY_MS);
    const after = sampleCampaigns("30d", undefined, "mionelo", MONDAY + (w + 1) * 7 * DAY_MS);
    assert.notDeepEqual(after, before, `week ${w}: output moved`);

    const byId = new Map(before.map((c) => [c.id, c]));
    const crossed = after.some((c) => {
      const p = byId.get(c.id);
      return (
        p && (Math.abs(rel(c.cost, p.cost)) >= 0.05 || Math.abs(rel(c.conversionValue, p.conversionValue)) >= 0.05)
      );
    });
    assert.ok(crossed, `week ${w}: at least one campaign crossed the 5 % threshold`);
  }
});

test("drift never breaks the demo portfolio's triage story", () => {
  // The e2e suite (kampane-triage.spec.ts) relies on: a critical row existing
  // (paused Video keeps spending), a healthy row existing (brand Search stays
  // far above target). Check across many weeks so no drift week can break it.
  for (let w = 0; w < 26; w++) {
    const rows = sampleCampaigns("30d", undefined, "mionelo", MONDAY + w * 7 * DAY_MS).map(withMetrics);
    const video = rows.find((c) => c.id === "1007");
    assert.equal(video.status, "paused");
    assert.ok(video.cost > 0, `week ${w}: paused Video still spends (critical)`);
    assert.equal(triage(video).severity, "critical");

    const brand = rows.find((c) => c.id === "1001");
    assert.ok(brand.roas >= TARGET_ROAS, `week ${w}: brand Search stays healthy`);
    assert.equal(triage(brand).severity, "ok");
  }
});
