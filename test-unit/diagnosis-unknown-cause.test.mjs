/** A model cause outside the closed set falls back to the DETERMINISTIC pick over the
 *  same numbers, never to a fixed catch-all (ads: "budget-misallocation", lead source:
 *  "mis-targeting"). The catch-all is the ladder's last rung; using it for "the model
 *  said something unknown" badged a tracking gap or a zero-conversion burn as a medium
 *  misallocation and a 12-lead source as mis-targeting. One fixture per ladder rung, three
 *  out-of-set spellings each, through the real normalisers (the model is mocked). Pure. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

let raw = {};
mock.module("@/lib/llm", {
  namedExports: {
    generateStructured: async (args) => ({ ok: true, data: { result: args.normalize(raw) } }),
  },
});
const ads = await import("@/lib/ai/tools/ads-diagnosis.ts");
const lead = await import("@/lib/ai/tools/lead-source-diagnosis.ts");

const camp = (id, over = {}) => ({
  id, name: `Kampaň ${id}`, platform: "google-ads", type: "search",
  cost: 20_000, conversions: 10, conversionValue: 60_000, roas: 3, pno: 0.33, ctr: 0.02, severity: "ok", ...over,
});
const adsReq = (over = {}) => ({
  period: "30d", currency: "CZK",
  totals: { cost: 100_000, conversions: 50, conversionValue: 300_000, roas: 3, pno: 0.33 },
  platforms: [{ platform: "google-ads", campaigns: 5, cost: 100_000, roas: 3 }],
  worst: [camp("w1", { cost: 10_000, conversions: 2, conversionValue: 8_000, roas: 0.8, pno: 1.25 })],
  best: [camp("b1", { cost: 40_000, conversions: 30, conversionValue: 200_000, roas: 5, pno: 0.2 })],
  targetPno: 0.25,
  ...over,
});
const ADS = {
  "tracking-gap": adsReq({ totals: { cost: 100_000, conversions: 0, conversionValue: 0, roas: 0, pno: 0 } }),
  "waste-zero-conv": adsReq({ worst: [camp("w1", { cost: 40_000, conversions: 0, conversionValue: 0, roas: 0, pno: 0 })] }),
  "efficiency-drift": adsReq({ prior: { cost: 70_000, conversions: 50, conversionValue: 290_000 } }),
  "platform-imbalance": adsReq({
    platforms: [
      { platform: "google-ads", campaigns: 3, cost: 60_000, roas: 4 },
      { platform: "sklik", campaigns: 2, cost: 40_000, roas: 1.5 },
    ],
  }),
  healthy: adsReq({ targetPno: 0.4 }),
  "budget-misallocation": adsReq(),
};

const leadReq = (over = {}) => ({
  source: "Meta formuláře", leads: 120, qualified: 60, won: 15, qualRate: 0.5, winRate: 0.25,
  spend: 24_000, cpl: 200, costPerQualified: 400, ...over,
});
const LEAD = {
  volume: leadReq({ leads: 12 }),
  spam: leadReq({ qualRate: 0.1, qualified: 12, cpl: 150 }),
  "mis-targeting(qual)": leadReq({ qualRate: 0.2, qualified: 24, cpl: 900, spend: 108_000 }),
  "mis-targeting(win)": leadReq({ winRate: 0.05, won: 3 }),
  pricing: leadReq({ costPerQualified: 4_000, cpl: 2_000, spend: 240_000 }),
  ok: leadReq(),
};

// Out-of-set causes a model plausibly returns: invented, near-miss spelling, Czech label.
const UNKNOWN = ["increase-budget-now", "waste zero conv", "plýtvání rozpočtem"];

const ADS_SEV = (c) => (c === "waste-zero-conv" || c === "tracking-gap" ? "high" : c === "healthy" ? "low" : "medium");
const LEAD_SEV = (c) => (c === "spam" ? "high" : c === "ok" || c === "volume" ? "low" : "medium");

for (const [rung, req] of Object.entries(ADS)) {
  test(`ads diagnosis: an out-of-set cause on the ${rung} rung shows the deterministic pick`, () => {
    const pick = ads.pickAdsCause(req);
    assert.equal(pick, rung, "fixture no longer lands on its rung");
    for (const u of UNKNOWN) {
      const out = ads.normalizeAdsDiagnosis({ summary: "x", likelyCause: u, recommendation: "y" }, req);
      assert.equal(out.likelyCause, pick, `"${u}" was coerced to ${out.likelyCause}`);
      assert.equal(out.severity, ADS_SEV(pick), "severity must follow the cause shown");
    }
    const inSet = ads.normalizeAdsDiagnosis({ summary: "x", likelyCause: "Healthy", recommendation: "y" }, req);
    assert.equal(inSet.likelyCause, "healthy", "an in-set model cause must pass through");
  });
}

for (const [rung, req] of Object.entries(LEAD)) {
  test(`lead-source diagnosis: an out-of-set cause on the ${rung} rung shows the deterministic pick`, async () => {
    const pick = lead.pickCause(req);
    assert.equal(pick, rung.replace(/\(.*\)/, ""), "fixture no longer lands on its rung");
    for (const u of UNKNOWN) {
      raw = { summary: "x", likelyCause: u, recommendation: "y" };
      const out = (await lead.generateLeadSourceDiagnosis(req)).data.result;
      assert.equal(out.likelyCause, pick, `"${u}" was coerced to ${out.likelyCause}`);
      assert.equal(out.severity, LEAD_SEV(pick), "severity must follow the cause shown");
    }
    raw = { summary: "x", likelyCause: "SPAM", recommendation: "y" };
    const inSet = (await lead.generateLeadSourceDiagnosis(req)).data.result;
    assert.equal(inSet.likelyCause, "spam", "an in-set model cause must pass through");
  });
}
