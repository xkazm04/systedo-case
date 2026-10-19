/** spend_spike reads a RELATIVE rise. A campaign that spent nothing last sync
 *  (paused, or newly enabled) has no base, so the diff's rel() reports +100% for
 *  it; the rule must not read that placeholder as "cost +100%, value lagging".
 *  A real spike on a campaign with a prior base must still fire. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffSnapshots } from "@/lib/campaigns/store/snapshot-diff";
import { triage } from "@/lib/campaigns/triage";
import { withMetrics } from "@/lib/campaigns/types";

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function fired(prevCost, prevValue, curCost, curValue) {
  const entry = (cost, value, status) => ({
    campaignId: "c1", name: "Search", status, cost, conversions: 5, conversionValue: value,
  });
  const diff = diffSnapshots(
    { syncedAt: "a", campaigns: [entry(prevCost, prevValue, "enabled")] },
    { syncedAt: "b", campaigns: [entry(curCost, curValue, "enabled")] },
  );
  const row = withMetrics({
    id: "c1", name: "Search", type: "search", status: "enabled",
    impressions: 50_000, clicks: 1_000, cost: curCost, conversions: 5, conversionValue: curValue,
  });
  return JSON.stringify(triage(row, diff.items[0])).includes("spend_spike") ||
    JSON.stringify(triage(row, diff.items[0])).includes("Skok");
}

test("a campaign with no prior spend never reads as a spend spike", () => {
  const rnd = lcg(225);
  let hits = 0;
  for (let i = 0; i < 200; i++) {
    const curCost = 2000 + Math.round(rnd() * 20000);
    const curValue = rnd() < 0.5 ? 0 : Math.round(curCost * rnd() * 0.4); // no or weak return
    if (fired(0, 0, curCost, curValue)) hits++;
  }
  assert.equal(hits, 0);
});

test("a real spike on a prior base still fires, proportional growth does not", () => {
  const rnd = lcg(7);
  let spikes = 0;
  let quiet = 0;
  for (let i = 0; i < 200; i++) {
    const prevCost = 5000 + Math.round(rnd() * 5000);
    const prevValue = Math.round(prevCost * 4);
    if (fired(prevCost, prevValue, Math.round(prevCost * 1.7), Math.round(prevValue * 1.1))) spikes++;
    if (fired(prevCost, prevValue, Math.round(prevCost * 1.7), Math.round(prevValue * 1.7))) quiet++;
  }
  assert.equal(spikes, 200);
  assert.equal(quiet, 0);
});
