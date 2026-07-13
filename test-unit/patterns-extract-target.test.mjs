/** Pattern mining honors the per-tenant PNO target (src/lib/patterns/extract.ts):
 *  `minePatterns` judges wins/losers against the tenant's own agreed pnoGoal (the
 *  same bar the reports/alerts use), not a hardcoded 0.18. The default must mine
 *  byte-identically to before; a stricter goal must flip a borderline campaign
 *  from a scaling template into a budget trap. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { minePatterns } from "@/lib/patterns/extract";
import { PAID_PORTFOLIO_TARGET_PNO } from "@/lib/targets";

/** One Search campaign at ROAS 7.0 (cost 10 000 → value 70 000, PNO ≈ 14.3 %).
 *  That sits ABOVE the default paid target (ROAS ≈ 5.56 @ 18 % PNO) but BELOW a
 *  stricter 10 % goal (ROAS 10) — the exact borderline the target controls. */
const roas7 = () => [
  {
    id: "c1",
    name: "Search generic",
    type: "search",
    status: "enabled",
    impressions: 100_000,
    clicks: 2_000,
    cost: 10_000,
    conversions: 40,
    conversionValue: 70_000,
  },
];

const titles = (patterns) => patterns.map((p) => p.title);
const has = (patterns, substr) => titles(patterns).some((t) => t.includes(substr));

test("default goal: a ROAS-7 campaign mines as a scaling win, not a trap", () => {
  const out = minePatterns(roas7(), {});
  assert.ok(has(out, "je nejefektivnější typ"), "best-type win present");
  assert.ok(has(out, "Vzor pro škálování"), "scaling template present");
  assert.ok(has(out, "Portfolio plní cílové PNO"), "portfolio-at-target present");
  assert.ok(!has(out, "Past na rozpočet"), "not flagged as a budget trap under 18%");
  // The default target renders as 18 % in the evidence (traces to the constant).
  const winner = out.find((p) => p.title.includes("Vzor pro škálování"));
  assert.match(winner.evidence, /cíl 18\s*%/);
});

test("the default argument equals passing the paid-portfolio target explicitly", () => {
  assert.equal(PAID_PORTFOLIO_TARGET_PNO, 0.18);
  assert.deepEqual(minePatterns(roas7(), {}), minePatterns(roas7(), {}, PAID_PORTFOLIO_TARGET_PNO));
});

test("stricter 10% goal: the same campaign becomes a budget trap, not a win", () => {
  const out = minePatterns(roas7(), {}, 0.1);
  assert.ok(has(out, "Past na rozpočet"), "flagged as a budget trap under 10%");
  assert.ok(!has(out, "Vzor pro škálování"), "no scaling template below the stricter target");
  assert.ok(!has(out, "je nejefektivnější typ"), "no best-type win below the stricter target");
  assert.ok(!has(out, "Portfolio plní cílové PNO"), "portfolio no longer at the stricter target");
  const trap = out.find((p) => p.title.includes("Past na rozpočet"));
  // Evidence measures against the stricter target ROAS (1/0.10 = 10×).
  assert.match(trap.evidence, /pod cílem 10/);
});

test("a non-default goal still produces the trend pattern from score history", () => {
  const histories = { overall: [{ score: 50 }, { score: 72 }] };
  const out = minePatterns(roas7(), histories, 0.1);
  assert.ok(has(out, "Optimalizace portfolia zabrala"), "history-derived trend is target-independent");
});
