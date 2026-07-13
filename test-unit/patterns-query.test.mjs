/** RAG query builders for the winning-patterns library (src/lib/patterns/query.ts)
 *  + the pattern-grounding they feed into the per-campaign eval prompt and the ads
 *  generator prompt (Direction 1). The overall query must stay byte-identical to
 *  the string the analyze routes built inline; the new campaign/ad queries must
 *  carry the situation the library is ranked against. Injection is user-prompt
 *  only — asserted by the golden gate elsewhere, here by presence/absence. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  overallPatternQuery,
  campaignPatternQuery,
  adPatternQuery,
} from "@/lib/patterns/query";
import { buildCampaignPrompt } from "@/lib/campaigns/report-input";
import { adsSkill } from "@/lib/ai/tools/ads";

function campaign(over = {}) {
  return {
    id: "c1",
    name: "Search · Brand",
    type: "search",
    status: "enabled",
    impressions: 100_000,
    clicks: 2_000,
    cost: 10_000,
    conversions: 40,
    conversionValue: 70_000,
    ...over,
  };
}

test("overallPatternQuery: totals + best/worst anchors, joined with spaces", () => {
  const q = overallPatternQuery([
    campaign({ id: "a", name: "Winner", conversionValue: 90_000 }),
    campaign({ id: "b", name: "Loser", conversionValue: 12_000 }),
  ]);
  assert.match(q, /^Portfolio ROAS \d/);
  assert.match(q, /Nejlepší kampaň Winner \(search\)\./);
  assert.match(q, /Nejslabší kampaň Loser \(search\)\./);
});

test("overallPatternQuery: a single campaign is both best and worst, no empty joins", () => {
  const q = overallPatternQuery([campaign({ name: "Solo" })]);
  assert.ok(!q.includes("  "), "no double space from a filtered-out anchor");
  assert.ok(q.includes("Nejlepší kampaň Solo"));
});

test("campaignPatternQuery: type + this campaign's own ROAS/PNO", () => {
  const q = campaignPatternQuery(campaign({ name: "PMax núts", type: "performance_max" }));
  assert.match(q, /Kampaň PMax núts typu Performance Max\./);
  assert.match(q, /ROAS 7\.0, PNO 14 %\./);
});

test("campaignPatternQuery: a zero-return spender reads as such, not NaN%", () => {
  const q = campaignPatternQuery(campaign({ conversionValue: 0, conversions: 0 }));
  assert.ok(!/NaN|Infinity/.test(q), "no NaN/Infinity leaks into the query");
  assert.match(q, /bez návratnosti/);
});

test("adPatternQuery: the brief the user typed (product, benefits, audience)", () => {
  const q = adPatternQuery({
    product: " Kešu ořechy ",
    benefits: "100% natural",
    audience: "zdravý životní styl",
  });
  assert.equal(q, "Kešu ořechy. 100% natural. zdravý životní styl");
});

test("adPatternQuery: blank fields are dropped, never join into stray dots", () => {
  assert.equal(adPatternQuery({ product: "X", benefits: "  ", audience: "" }), "X");
});

// --- the prompts actually carry the lines (user-prompt injection) ------------

test("buildCampaignPrompt: pattern lines render as a grounded block when supplied", () => {
  const c = campaign();
  const lines = ["- Brandové vyhledávání: drž ho oddělené.", "- Vzor pro škálování: přidej rozpočet."];
  const withPatterns = buildCampaignPrompt(c, [c], "30d", undefined, undefined, lines);
  assert.ok(withPatterns.includes("OSVĚDČENÉ VZORY Z TOHOTO ÚČTU"));
  assert.ok(withPatterns.includes("Brandové vyhledávání: drž ho oddělené."));
});

test("buildCampaignPrompt: no pattern block (and unchanged) when none supplied", () => {
  const c = campaign();
  const base = buildCampaignPrompt(c, [c], "30d");
  assert.ok(!base.includes("OSVĚDČENÉ VZORY"));
  // default (no patterns arg) equals passing an empty list — byte-identical
  assert.equal(base, buildCampaignPrompt(c, [c], "30d", undefined, undefined, []));
});

test("adsSkill.buildPrompt: winning patterns render as a block, only when present", () => {
  const req = {
    product: "Kešu ořechy",
    benefits: "100% natural",
    audience: "zdravý životní styl",
    platform: "google",
    tone: "pratelsky",
  };
  const base = adsSkill.buildPrompt(req);
  assert.ok(!base.includes("OSVĚDČENÉ VZORY"), "ungrounded prompt has no pattern block");
  const grounded = adsSkill.buildPrompt({ ...req, patterns: ["- Brand search je nejlevnější poptávka."] });
  assert.ok(grounded.includes("OSVĚDČENÉ VZORY Z TOHOTO ÚČTU"));
  assert.ok(grounded.includes("Brand search je nejlevnější poptávka."));
});
