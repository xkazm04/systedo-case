/** Campaign table → one scoped change-set: the PURE selection plan
 *  (src/lib/campaigns/stage-selection.ts).
 *
 *  Before this module the table staged one row per click, and each click persisted
 *  its own pending set before the operator had seen a single move. The selection
 *  plan is what the SelectionBar reads: which rows the action receives (the
 *  selection ∩ the applied filter, so the count beside the button names every row
 *  the action gets), how many ticks sit hidden behind the filter, which ONE network
 *  the selection belongs to, and whether it may be previewed and staged.
 *
 *  The rules pinned here:
 *    - a hidden tick is COUNTED, not dropped: the raw selection is never pruned;
 *    - one change-set is one network, so a mixed selection cannot even preview;
 *    - Sklik rows preview (a read) but never stage (a write the flag gates);
 *    - sample rows never stage (a change-set built from demo data is not a proposal).
 *
 *  Client-safe by construction (types-only imports), so it runs here with no mocks. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planStageSelection, stageRequestBody } from "@/lib/campaigns/stage-selection";

const g1 = { id: "g1", source: "google-ads", severity: "critical" };
const g2 = { id: "g2", source: "google-ads", severity: "critical" };
const g3 = { id: "g3", source: "google-ads", severity: "warning" };
const s1 = { id: "s1", source: "sklik", severity: "critical" };
const s2 = { id: "s2", source: "sklik", severity: "warning" };
const x1 = { id: "x1", source: "sample", severity: "critical" };
const ROWS = [g1, g2, g3, s1, s2, x1];
const ALL = ROWS.map((r) => r.id);

test("two visible Google rows → both in the payload, stageable on google-ads", () => {
  const plan = planStageSelection([g1, g2, g3], new Set(["g1", "g2"]), new Set(["g1", "g2", "g3"]));
  assert.deepEqual(plan, {
    payloadIds: ["g1", "g2"],
    hiddenCount: 0,
    network: "google-ads",
    canPreview: true,
    canStage: true,
    reason: null,
  });
});

test("a tick behind the filter is counted as hidden and is not sent; the selection is not pruned", () => {
  const selected = new Set(["g1", "g2"]);
  const plan = planStageSelection([g1, g2, g3], selected, new Set(["g1", "g3"]));
  assert.deepEqual(plan.payloadIds, ["g1"]);
  assert.equal(plan.hiddenCount, 1);
  assert.equal(plan.canStage, true);
  assert.deepEqual([...selected], ["g1", "g2"], "the raw selection survives the filter");
});

test("a Google row and a Sklik row cannot share a change-set → no preview, mixed-network", () => {
  const plan = planStageSelection(ROWS, new Set(["g1", "s1"]), new Set(ALL));
  assert.equal(plan.canPreview, false);
  assert.equal(plan.canStage, false);
  assert.equal(plan.reason, "mixed-network");
});

test("an all-Sklik selection previews (a read) but never stages (a write)", () => {
  const plan = planStageSelection(ROWS, new Set(["s1", "s2"]), new Set(ALL));
  assert.equal(plan.network, "sklik");
  assert.equal(plan.canPreview, true);
  assert.equal(plan.canStage, false);
  assert.equal(plan.reason, "read-only-network");
});

test("a selection holding a sample row never stages", () => {
  const plan = planStageSelection(ROWS, new Set(["x1"]), new Set(ALL));
  assert.equal(plan.canStage, false);
  assert.equal(plan.reason, "sample");
});

test("nothing visible selected → nothing to preview; ids a re-sync dropped are ignored", () => {
  const plan = planStageSelection([g1, g2], new Set(["gone", "g2"]), new Set(["g1"]));
  assert.deepEqual(plan.payloadIds, []);
  assert.equal(plan.hiddenCount, 1, "g2 exists and is hidden; `gone` is no row at all");
  assert.equal(plan.canPreview, false);
  assert.equal(plan.reason, "empty");
});

test("source-less rows take the tenant's source (a single-network table stamps none)", () => {
  const plan = planStageSelection(
    [{ id: "a" }, { id: "b" }],
    new Set(["a", "b"]),
    new Set(["a", "b"]),
    { fallbackSource: "sklik" }
  );
  assert.equal(plan.network, "sklik");
  assert.equal(plan.canStage, false);
});

test("the wire body: preview and stage ask for the SAME scope; only stage carries the basis", () => {
  const plan = planStageSelection([g1, g2], new Set(["g1", "g2"]), new Set(["g1", "g2"]));
  const ctx = { projectId: "p1", alertByCampaign: new Map() };
  assert.deepEqual(stageRequestBody(plan, "preview", ctx), {
    action: "preview",
    scopeCampaignIds: ["g1", "g2"],
    projectId: "p1",
  });
  assert.deepEqual(stageRequestBody(plan, "create", { ...ctx, basis: "2026-09-01T00:00:00.000Z" }), {
    action: "create",
    scopeCampaignIds: ["g1", "g2"],
    projectId: "p1",
    basis: "2026-09-01T00:00:00.000Z",
  });
});

test("the wire body: a one-row selection with its own alert keeps the alert-scoped path", () => {
  const plan = planStageSelection([g1, g2], new Set(["g1"]), new Set(["g1", "g2"]));
  const body = stageRequestBody(plan, "preview", {
    projectId: "p1",
    alertByCampaign: new Map([["g1", "al_1"]]),
  });
  assert.deepEqual(body, { action: "preview", alertId: "al_1", projectId: "p1" });
});

test("the wire body: a Sklik preview names its network so it reads the Sklik tenant", () => {
  const plan = planStageSelection(ROWS, new Set(["s1", "s2"]), new Set(ALL));
  const body = stageRequestBody(plan, "preview", { projectId: "p1", alertByCampaign: new Map() });
  assert.equal(body.source, "sklik");
});
