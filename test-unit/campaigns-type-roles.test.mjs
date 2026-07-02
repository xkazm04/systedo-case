/** Channel-type roles (src/lib/campaigns/types.ts CAMPAIGN_TYPE_ROLES) and their
 *  prompt wiring: every type carries a prospecting/performance role, the derived
 *  type lists never drift from the map, and both AI prompts frame prospecting
 *  ROAS in portfolio context instead of judging it against the direct target. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPAIGN_TYPES,
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_TYPE_ROLES,
  CAMPAIGN_TYPE_ROLE_LABELS,
  CAMPAIGN_TYPE_ROLE_LABELS_EN,
  campaignTypesForRole,
} from "@/lib/campaigns/types";
import { buildCampaignPrompt, buildOverallPrompt } from "@/lib/campaigns/report-input";

const campaign = (id, type, over = {}) => ({
  id,
  name: `Kampaň ${id}`,
  type,
  status: "enabled",
  impressions: 50_000,
  clicks: 800,
  cost: 10_000,
  conversions: 25,
  conversionValue: 60_000,
  ...over,
});

test("every campaign type has a role and both locales label both roles", () => {
  for (const type of CAMPAIGN_TYPES) {
    const role = CAMPAIGN_TYPE_ROLES[type];
    assert.ok(role === "performance" || role === "prospecting", `${type} has a role`);
    assert.ok(CAMPAIGN_TYPE_ROLE_LABELS[role]);
    assert.ok(CAMPAIGN_TYPE_ROLE_LABELS_EN[role]);
  }
  // Search answers demand; video creates it — the two anchors of the split.
  assert.equal(CAMPAIGN_TYPE_ROLES.search, "performance");
  assert.equal(CAMPAIGN_TYPE_ROLES.video, "prospecting");
});

test("campaignTypesForRole derives the localized lists straight from the map", () => {
  const prospecting = campaignTypesForRole("prospecting");
  for (const type of CAMPAIGN_TYPES) {
    const inList = prospecting.includes(CAMPAIGN_TYPE_LABELS[type]);
    assert.equal(inList, CAMPAIGN_TYPE_ROLES[type] === "prospecting", type);
  }
});

test("both prompts carry the role framing and tag campaign/type lines", () => {
  const all = [campaign("1", "search"), campaign("2", "video", { conversionValue: 20_000 })];

  const overall = buildOverallPrompt(all, "30d");
  assert.match(overall, /Role typů kampaní: výkonnostní/);
  assert.match(overall, /prospekční/);
  // Per-type breakdown lines carry the role next to the count.
  assert.match(overall, /- Video \(1, prospekční\):/);
  assert.match(overall, /- Search \(1, výkonnostní\):/);

  const single = buildCampaignPrompt(all[1], all, "30d");
  assert.match(single, /typ Video \(prospekční\)/);
  assert.match(single, /Role typů kampaní/);
});
