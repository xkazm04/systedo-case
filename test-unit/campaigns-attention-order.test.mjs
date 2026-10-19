/** One attention order for every queue: severity, then spend, then id. The batch
 *  route used to sort without the goals and the daily series the table's queue
 *  uses, and neither broke a tie on id. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMetrics } from "@/lib/campaigns/types";
import { attentionOrder, triageWeight, triageGoals, SEVERITY_RANK, triage } from "@/lib/campaigns/triage";

let seed = 20261014;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const row = (id, over = {}) =>
  withMetrics({
    id, name: id, status: "enabled", type: "search",
    impressions: 1000, clicks: 50, cost: 1000, conversions: 3, conversionValue: 3000, ...over,
  });

test("ties on severity and spend order by id, whatever the input order", () => {
  const rows = ["c", "a", "d", "b"].map((id) => row(id));
  for (const input of [rows, [...rows].reverse()]) {
    assert.deepEqual(attentionOrder(input).map((r) => r.id), ["a", "b", "c", "d"]);
  }
});

test("severity outranks spend; the input is not mutated", () => {
  const big = row("big", { conversionValue: 900000, cost: 90000 });
  const small = row("small", { conversions: 0, conversionValue: 0, cost: 50 });
  const input = [big, small];
  assert.deepEqual(attentionOrder(input).map((r) => r.id), ["small", "big"]);
  assert.deepEqual(input.map((r) => r.id), ["big", "small"]);
});

test("A/B: the goal-aware order differs from the goal-blind one, and B is a function of the set", () => {
  const goals = triageGoals(0.1, 6); // a 10x target: stricter than the default bands
  let blindVsAware = 0, unstableA = 0, unstableB = 0, floorBreaks = 0;
  for (let n = 0; n < 200; n++) {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row(`c${i}`, {
        cost: 100 * (1 + Math.floor(rnd() * 4)),
        conversions: 1 + Math.floor(rnd() * 5),
        conversionValue: 100 + Math.floor(rnd() * 3000),
      })
    );
    const A = [...rows].sort((a, b) => triageWeight(b) - triageWeight(a)).map((r) => r.id);
    const aware = attentionOrder(rows, undefined, goals).map((r) => r.id);
    if (A.join() !== aware.join()) blindVsAware++;
    const shuffled = [...rows].sort(() => rnd() - 0.5);
    const A2 = [...shuffled].sort((a, b) => triageWeight(b) - triageWeight(a)).map((r) => r.id);
    if (A.join() !== A2.join()) unstableA++;
    if (aware.join() !== attentionOrder(shuffled, undefined, goals).map((r) => r.id).join()) unstableB++;
    const sev = aware.map((id) => SEVERITY_RANK[triage(rows.find((r) => r.id === id), undefined, goals).severity]);
    if (sev.some((s, i) => i > 0 && s > sev[i - 1])) floorBreaks++;
  }
  console.log({ blindVsAware, unstableA, unstableB, floorBreaks });
  assert.equal(unstableB, 0);
  assert.equal(floorBreaks, 0);
  assert.ok(blindVsAware > 0);
});
