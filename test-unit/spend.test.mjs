/** Spend compute (src/lib/spend/compute.ts) + seeded receipts (sample.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { byModel, byOperation, costShare, filterSpend, rollupBy, totals } from "@/lib/spend/compute";
import { spendForProject } from "@/lib/spend/sample";

const e = (over = {}) => ({ id: "e", toolId: "ads", model: "gpt-4o-mini", calls: 1, tokens: 1000, costUsd: 0.1, daysAgo: 5, ...over });

test("filterSpend keeps entries within the window; 0 = no limit", () => {
  const entries = [e({ id: "a", daysAgo: 3 }), e({ id: "b", daysAgo: 40 })];
  assert.deepEqual(filterSpend(entries, 7).map((x) => x.id), ["a"]);
  assert.equal(filterSpend(entries, 0).length, 2);
});

test("totals sums calls, tokens and cost", () => {
  const t = totals([e({ calls: 2, tokens: 1000, costUsd: 0.2 }), e({ calls: 3, tokens: 500, costUsd: 0.05 })]);
  assert.equal(t.calls, 5);
  assert.equal(t.tokens, 1500);
  assert.ok(Math.abs(t.costUsd - 0.25) < 1e-9);
});

test("rollupBy groups + sums and sorts by cost desc", () => {
  const rows = rollupBy(
    [e({ toolId: "ads", costUsd: 0.1 }), e({ toolId: "brief", costUsd: 0.5 }), e({ toolId: "ads", costUsd: 0.2 })],
    (x) => x.toolId
  );
  assert.deepEqual(rows.map((r) => r.key), ["brief", "ads"]);
  assert.ok(Math.abs(rows[1].costUsd - 0.3) < 1e-9);
});

test("costShare is the fraction of total, 0 when total is 0", () => {
  assert.equal(costShare({ key: "x", calls: 0, tokens: 0, costUsd: 25 }, 100), 0.25);
  assert.equal(costShare({ key: "x", calls: 0, tokens: 0, costUsd: 0 }, 0), 0);
});

test("spendForProject is deterministic with valid, non-negative figures", () => {
  const project = { id: "demo-local" };
  const a = spendForProject(project, 40);
  assert.deepEqual(a, spendForProject(project, 40));
  assert.equal(a.length, 40);
  for (const x of a) {
    assert.ok(x.calls >= 1 && x.tokens > 0 && x.costUsd >= 0);
  }
  // both group-bys cover the same total cost
  const opTotal = byOperation(a).reduce((s, r) => s + r.costUsd, 0);
  const modelTotal = byModel(a).reduce((s, r) => s + r.costUsd, 0);
  assert.ok(Math.abs(opTotal - modelTotal) < 1e-6);
});
