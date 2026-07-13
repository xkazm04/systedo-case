/** Close-the-loop: alert → pre-staged change-set. Covers the PURE parts — the
 *  alert workflow-status defaulting (backward compatibility), the campaign-id
 *  scoping derived from an alert's items, the "is this alert actionable" predicate
 *  that gates the one-click inbox action, and the donor-scoping in
 *  recommendBudgetMoves that pre-scopes a change-set to exactly the alerted
 *  campaigns. No firebase — the resolution write itself is I/O and lives in
 *  control-plane.ts; here we prove the logic that decides *what* gets staged. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TARGET_ROAS, withMetrics } from "@/lib/campaigns/types";
import { recommendBudgetMoves } from "@/lib/campaigns/budget-moves";
import {
  alertStatus,
  alertCampaignIds,
  isAlertActionable,
} from "@/lib/campaigns/alert-suppression";

function row(id, { cost, roasFactor, status = "enabled" }) {
  return withMetrics({
    id,
    name: `Kampaň ${id}`,
    type: "search",
    status,
    impressions: 50_000,
    clicks: 1_000,
    cost,
    conversions: roasFactor > 0 ? 20 : 0,
    conversionValue: Math.round(cost * TARGET_ROAS * roasFactor),
  });
}

// --- workflow status (backward compatibility) --------------------------------

test("alertStatus defaults a legacy doc with no status to 'new'", () => {
  assert.equal(alertStatus({}), "new");
  assert.equal(alertStatus({ status: undefined }), "new");
});

test("alertStatus returns an explicitly set status", () => {
  assert.equal(alertStatus({ status: "acknowledged" }), "acknowledged");
  assert.equal(alertStatus({ status: "resolved" }), "resolved");
});

// --- campaign-id scoping derived from the alert ------------------------------

test("alertCampaignIds dedupes, preserves order, and drops empty ids", () => {
  const ids = alertCampaignIds({
    items: [
      { campaignId: "b" },
      { campaignId: "a" },
      { campaignId: "b" }, // dup
      { campaignId: "" }, // empty → dropped
      { campaignId: "c" },
    ],
  });
  assert.deepEqual(ids, ["b", "a", "c"]);
});

test("alertCampaignIds on an item-less alert yields []", () => {
  assert.deepEqual(alertCampaignIds({ items: [] }), []);
});

// --- the actionability predicate ---------------------------------------------

test("isAlertActionable: fresh critical alert naming campaigns is actionable", () => {
  assert.equal(
    isAlertActionable({ type: "critical", status: "new", items: [{ campaignId: "x" }] }),
    true
  );
  // legacy critical alert (no status) defaults to new → still actionable
  assert.equal(
    isAlertActionable({ type: "critical", items: [{ campaignId: "x" }] }),
    true
  );
});

test("isAlertActionable is false for digests, non-fresh, or campaign-less alerts", () => {
  assert.equal(
    isAlertActionable({ type: "digest", status: "new", items: [{ campaignId: "x" }] }),
    false
  );
  assert.equal(
    isAlertActionable({ type: "critical", status: "acknowledged", items: [{ campaignId: "x" }] }),
    false
  );
  assert.equal(
    isAlertActionable({ type: "critical", status: "resolved", items: [{ campaignId: "x" }] }),
    false
  );
  assert.equal(isAlertActionable({ type: "critical", status: "new", items: [] }), false);
});

// --- donor-scoping: pre-scope a change-set to exactly the alerted campaigns ---

test("donorScopeIds restricts shift donors to the alerted campaigns only", () => {
  const rows = [
    row("in", { cost: 20_000, roasFactor: 0.5 }), // below-target, IN scope
    row("out", { cost: 20_000, roasFactor: 0.5 }), // below-target, OUT of scope
    row("rec", { cost: 20_000, roasFactor: 1.4 }), // over-performer recipient
  ];
  const { moves } = recommendBudgetMoves(rows, { donorScopeIds: ["in"] });
  assert.equal(moves.length, 1, "only the in-scope donor is acted on");
  assert.equal(moves[0].fromId, "in");
  assert.equal(moves[0].toId, "rec");
});

test("donorScopeIds scopes a zero-return burner to a pause and leaves others alone", () => {
  const rows = [
    row("z", { cost: 8_000, roasFactor: 0 }), // no_conversions burner, IN scope
    row("out", { cost: 20_000, roasFactor: 0.5 }), // below-target, OUT of scope
    row("rec", { cost: 20_000, roasFactor: 1.4 }),
  ];
  const { moves } = recommendBudgetMoves(rows, {
    includePauses: true,
    donorScopeIds: ["z"],
  });
  assert.equal(moves.length, 1);
  assert.equal(moves[0].kind, "pause");
  assert.equal(moves[0].fromId, "z");
  assert.equal(moves[0].amount, 8_000);
});

test("a scope with no sensible donor yields no moves (surfaced honestly, not invented)", () => {
  const rows = [
    row("in", { cost: 20_000, roasFactor: 0.5 }),
    row("rec", { cost: 20_000, roasFactor: 1.4 }),
  ];
  // scope only the over-performer, which is never a donor → nothing to stage.
  const { moves } = recommendBudgetMoves(rows, { includePauses: true, donorScopeIds: ["rec"] });
  assert.equal(moves.length, 0);
});
