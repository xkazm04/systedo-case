/** The "money pit" pattern (src/lib/patterns/extract.ts) names the campaign whose fix
 *  recovers the most money: wasted spend = the spend the target PNO does not justify,
 *  ALL of it for a campaign that converted nothing. The ads diagnosis ranks the same
 *  way (`wastedSpend` in src/lib/diagnoses/ads-request.ts). Before this, the miner
 *  required ROAS > 0, so a zero-conversion spender (the biggest waste by
 *  construction) could never be the pit, and a smaller partial waste was named
 *  instead. A row with conversions but no value is "not measured" (as in
 *  budget-moves) and stays out: the pattern has no field to say why. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { minePatterns } from "@/lib/patterns/extract";
import { wastedSpend } from "@/lib/diagnoses/ads-request";
import { sampleCampaigns } from "@/lib/campaigns/sample";
import { withMetrics } from "@/lib/campaigns/types";

const camp = (id, name, cost, conversions, conversionValue, status = "enabled") => ({
  id,
  name,
  type: "search",
  status,
  impressions: 50_000,
  clicks: 1_000,
  cost,
  conversions,
  conversionValue,
});

const pit = (patterns) => patterns.find((p) => p.title.includes("Past na rozpočet"));

test("a zero-conversion spender outranks a smaller partial waste", () => {
  const out = minePatterns(
    [
      camp("big0", "Display bez konverzí", 8_000, 0, 0),
      // ROAS 4 under the default 5.56 target: waste = 10 000 - 40 000 * 0.18 = 2 800
      camp("part", "Search pod cílem", 10_000, 20, 40_000),
    ],
    {}
  );
  const p = pit(out);
  assert.ok(p, "a money pit is named");
  assert.match(p.title, /Display bez konverzí/);
  assert.match(p.evidence, /8\s?000/);
});

test("the pit is the ads diagnosis's top waste on the same rows", () => {
  const rows = [
    camp("a", "A nula", 3_000, 0, 0),
    camp("b", "B pod cílem", 20_000, 30, 60_000), // waste 20 000 - 10 800 = 9 200
    camp("c", "C nad cílem", 5_000, 40, 50_000), // at target: waste 0
  ];
  const top = rows
    .map((r) => ({ r, w: wastedSpend(withMetrics(r), 0.18) }))
    .sort((x, y) => y.w - x.w || y.r.cost - x.r.cost)[0].r;
  assert.match(pit(minePatterns(rows, {})).title, new RegExp(top.name));
});

test("conversions without value are not measured, never a pit", () => {
  const out = minePatterns([camp("lead", "Leady bez hodnoty", 9_000, 12, 0)], {});
  assert.equal(pit(out), undefined);
});

test("a paused zero-conversion campaign is not a pit (nothing left to watch)", () => {
  const out = minePatterns([camp("p0", "Pozastavená", 9_000, 0, 0, "paused")], {});
  assert.equal(pit(out), undefined);
});

test("ties on waste break by spend, so the subject is deterministic", () => {
  // both waste 4 000: the zero-converter all of its 4 000, the larger one 9 400 - 5 400
  const rows = [camp("s", "Malá nula", 4_000, 0, 0), camp("l", "Velká pod cílem", 9_400, 10, 30_000)];
  for (const order of [rows, [...rows].reverse()]) {
    assert.match(pit(minePatterns(order, {})).title, /Velká pod cílem/);
  }
});

test("sample spine: the pit is the largest waster", () => {
  const rows = sampleCampaigns("30d");
  const ranked = rows
    .map((r) => ({ r, w: wastedSpend(withMetrics(r), 0.18) }))
    .filter((x) => x.r.status === "enabled" && x.w > 0)
    .sort((x, y) => y.w - x.w || y.r.cost - x.r.cost);
  const p = pit(minePatterns(rows, {}));
  if (ranked.length === 0) return assert.equal(p, undefined);
  assert.ok(p, "a pit is named when an enabled campaign wastes");
  assert.ok(p.title.includes(ranked[0].r.name), `pit ${p.title} vs top waster ${ranked[0].r.name}`);
});
