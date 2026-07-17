/** Google advertising_channel_type → CampaignType mapping (src/lib/google/ads.ts
 *  toCampaignType). Unmapped/future channel types must land in the explicit
 *  `"other"` bucket, NOT be silently coerced to "search" (which would inflate the
 *  Search share and judge it by the strict performance-role lens). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toCampaignType } from "@/lib/google/ads";
import { CAMPAIGN_TYPES } from "@/lib/campaigns/types";

test("known channel types map to their CampaignType", () => {
  assert.equal(toCampaignType("SEARCH"), "search");
  assert.equal(toCampaignType("PERFORMANCE_MAX"), "performance_max");
  assert.equal(toCampaignType("SHOPPING"), "shopping");
  assert.equal(toCampaignType("DISPLAY"), "display");
  assert.equal(toCampaignType("DEMAND_GEN"), "demand_gen");
  assert.equal(toCampaignType("VIDEO"), "video");
});

test("unmapped, unknown, empty and missing channel types become 'other', never 'search'", () => {
  for (const t of ["HOTEL", "LOCAL", "SMART", "MULTI_CHANNEL", "TRAVEL", "FUTURE_TYPE", "", undefined]) {
    assert.equal(toCampaignType(t), "other", `${t} must map to other`);
  }
  // "other" is a real member of the type universe (has label/colour/role entries).
  assert.ok(CAMPAIGN_TYPES.includes("other"));
});
