/** summarizeSnapshotEntries (src/lib/campaigns/triage.ts) — the pure layer that
 *  turns a stored sync snapshot (status/cost/conversions/conversionValue per
 *  campaign) into the same TriageSummary the live banner shows, powering the
 *  deterministic portfolio-health timeline. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TARGET_ROAS } from "@/lib/campaigns/types";
import { ROAS_CRITICAL_RATIO, summarizeSnapshotEntries } from "@/lib/campaigns/triage";

const entry = ({ status = "enabled", cost, roasFactor }) => ({
  status,
  cost,
  conversions: roasFactor > 0 ? 10 : 0,
  conversionValue: Math.round(cost * TARGET_ROAS * roasFactor),
});

test("all four snapshot rules fire from snapshot fields alone", () => {
  const s = summarizeSnapshotEntries([
    entry({ status: "paused", cost: 5_000, roasFactor: 1.0 }), // paused_spending -> critical
    entry({ cost: 4_000, roasFactor: 0 }), // no_conversions -> critical
    entry({ cost: 6_000, roasFactor: ROAS_CRITICAL_RATIO - 0.1 }), // roas_critical
    entry({ cost: 7_000, roasFactor: 0.85 }), // below_target -> warning
    entry({ cost: 8_000, roasFactor: 1.3 }), // healthy
  ]);
  assert.deepEqual(s, { critical: 3, warning: 1, attention: 4, ok: 1, total: 5 });
});

test("a healthy snapshot rolls up to all-ok", () => {
  const s = summarizeSnapshotEntries([
    entry({ cost: 10_000, roasFactor: 1.2 }),
    entry({ cost: 3_000, roasFactor: 2.0 }),
    // Paused with zero spend is benign, not a finding.
    entry({ status: "paused", cost: 0, roasFactor: 0 }),
  ]);
  assert.deepEqual(s, { critical: 0, warning: 0, attention: 0, ok: 3, total: 3 });
});

test("empty and malformed entries degrade to zeros instead of throwing", () => {
  assert.deepEqual(summarizeSnapshotEntries([]), {
    critical: 0,
    warning: 0,
    attention: 0,
    ok: 0,
    total: 0,
  });
  const s = summarizeSnapshotEntries([
    { status: "enabled", cost: NaN, conversions: NaN, conversionValue: NaN },
  ]);
  assert.equal(s.total, 1);
  assert.equal(s.ok, 1); // zeroed metrics → no spend → no rule fires
});
