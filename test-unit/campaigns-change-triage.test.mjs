/** Pure pieces behind the change-aware alerting wire-up: indexChanges (the
 *  shared ChangesSummary → by-id lookup) and the triage escalation it feeds —
 *  a ROAS crater must turn an otherwise-quiet campaign critical, because the
 *  alert pipeline and the weekly digest now count criticals with the diff. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { indexChanges, withMetrics, TARGET_ROAS } from "@/lib/campaigns/types";
import { triage, triageWeight, ROAS_CRATER_RETAINED_MAX } from "@/lib/campaigns/triage";

/** A campaign sitting just below target — warning-level on its own. */
function warningRow() {
  const roas = TARGET_ROAS * 0.9;
  const cost = 10_000;
  return withMetrics({
    id: "c1",
    name: "Search · Test",
    type: "search",
    status: "enabled",
    impressions: 100_000,
    clicks: 2_000,
    cost,
    conversions: 40,
    conversionValue: Math.round(cost * roas),
  });
}

function craterChange(row) {
  const roasBefore = TARGET_ROAS * 1.2; // was healthy…
  return {
    campaignId: row.id,
    name: row.name,
    kind: "changed",
    costBefore: row.cost,
    costAfter: row.cost,
    costDelta: 0,
    valueDelta: -(1 - ROAS_CRATER_RETAINED_MAX) - 0.05,
    roasBefore,
    // …and retained less than the crater threshold of it.
    roasAfter: roasBefore * (ROAS_CRATER_RETAINED_MAX - 0.05),
  };
}

test("indexChanges maps items by campaign id and is null-safe", () => {
  assert.deepEqual(indexChanges(null), {});
  assert.deepEqual(indexChanges(undefined), {});

  const row = warningRow();
  const change = craterChange(row);
  const byId = indexChanges({
    since: "2026-06-25T00:00:00.000Z",
    current: "2026-07-02T00:00:00.000Z",
    added: 0,
    removed: 0,
    changed: 1,
    items: [change],
  });
  assert.deepEqual(Object.keys(byId), [row.id]);
  assert.equal(byId[row.id], change);
});

test("a ROAS crater escalates triage to critical only when the diff is supplied", () => {
  const row = warningRow();
  const change = craterChange(row);

  // Without the diff the row is merely a warning (below target, not critical)…
  assert.equal(triage(row).severity, "warning");

  // …and with it, the crater rule fires and the severity is critical — this is
  // exactly what evaluateAndAlert and the digest now see.
  const result = triage(row, change);
  assert.equal(result.severity, "critical");
  assert.equal(result.primary?.id, "roas_crater");
});

test("triageWeight counts the change-aware rules and keeps ordering by spend", () => {
  const row = warningRow();
  const change = craterChange(row);

  // Same row: the crater lifts it a full severity band above its snapshot weight.
  assert.ok(triageWeight(row, change) > triageWeight(row) + 1e11);

  // The no-change path is byte-compatible with the old single-arg call…
  assert.equal(triageWeight(row), triageWeight(row, undefined));

  // …and within one severity band (same ROAS, half the spend → still warning)
  // the bigger spender ranks first.
  const smaller = withMetrics({
    ...row,
    id: "c2",
    cost: row.cost / 2,
    conversionValue: Math.round(row.conversionValue / 2),
  });
  assert.equal(triage(smaller).severity, "warning");
  assert.ok(triageWeight(row) > triageWeight(smaller));
});
