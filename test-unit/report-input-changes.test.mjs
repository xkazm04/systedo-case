/** Change-aware prompt grounding (campaign-model-prompts idea #1): both prompt
 *  builders must render the sync-over-sync diff block and run the SAME
 *  change-aware triage the UI badges show — the AI evaluation must not
 *  contradict a roas_crater badge sitting right next to it. The no-diff path
 *  must stay byte-compatible with the previous single-window prompts. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TARGET_ROAS } from "@/lib/campaigns/types";
import { ROAS_CRATER_RETAINED_MAX } from "@/lib/campaigns/triage";
import { buildCampaignPrompt, buildOverallPrompt } from "@/lib/campaigns/report-input";

const CHANGES_HEADING = "ZMĚNY OD MINULÉ SYNCHRONIZACE";

/** A campaign sitting just below target — warning-level on its own. */
function warningCampaign(id = "c1", name = "Search · Test") {
  const roas = TARGET_ROAS * 0.9;
  const cost = 10_000;
  return {
    id,
    name,
    type: "search",
    status: "enabled",
    impressions: 100_000,
    clicks: 2_000,
    cost,
    conversions: 40,
    conversionValue: Math.round(cost * roas),
  };
}

function craterChange(c) {
  const roasBefore = TARGET_ROAS * 1.2; // was healthy…
  return {
    campaignId: c.id,
    name: c.name,
    kind: "changed",
    costBefore: c.cost,
    costAfter: c.cost,
    costDelta: 0,
    valueDelta: -(1 - ROAS_CRATER_RETAINED_MAX) - 0.05,
    roasBefore,
    // …and retained less than the crater threshold of it.
    roasAfter: roasBefore * (ROAS_CRATER_RETAINED_MAX - 0.05),
  };
}

function summaryFor(items) {
  return {
    since: "2026-06-25T00:00:00.000Z",
    current: "2026-07-02T00:00:00.000Z",
    added: 0,
    removed: 0,
    changed: items.length,
    items,
  };
}

test("buildCampaignPrompt without a diff stays identical to the legacy call", () => {
  const target = warningCampaign();
  const all = [target, warningCampaign("c2", "Shopping · Feed")];
  assert.equal(
    buildCampaignPrompt(target, all, "30d"),
    buildCampaignPrompt(target, all, "30d", undefined)
  );
  assert.ok(!buildCampaignPrompt(target, all, "30d").includes(CHANGES_HEADING));
});

test("buildCampaignPrompt renders the target's diff and the change-aware triage", () => {
  const target = warningCampaign();
  const other = warningCampaign("c2", "Shopping · Feed");
  const changes = summaryFor([craterChange(target)]);

  const prompt = buildCampaignPrompt(target, [target, other], "30d", changes);
  assert.ok(prompt.includes(CHANGES_HEADING), "diff block present");
  assert.ok(prompt.includes("ROAS spadl z"), "crater triage detail present");
  assert.ok(prompt.includes("Propad ROAS proti minulé synchronizaci"), "crater label present");

  // A diff belonging to ANOTHER campaign must not leak into this one's prompt.
  const foreign = buildCampaignPrompt(other, [target, other], "30d", changes);
  assert.ok(!foreign.includes(CHANGES_HEADING));
});

test("buildOverallPrompt renders movers and escalates flagged campaigns via the diff", () => {
  const a = warningCampaign();
  const b = warningCampaign("c2", "Shopping · Feed");
  const changes = summaryFor([craterChange(a)]);

  const without = buildOverallPrompt([a, b], "30d");
  assert.ok(!without.includes(CHANGES_HEADING));
  assert.ok(!without.includes("KRITICKÉ"), "no critical without the diff");

  const withDiff = buildOverallPrompt([a, b], "30d", [], changes);
  assert.ok(withDiff.includes(CHANGES_HEADING), "diff block present");
  assert.ok(withDiff.includes(`„${a.name}“: náklady`), "mover line present");
  assert.ok(withDiff.includes("KRITICKÉ"), "crater escalates the flagged list to critical");
});
