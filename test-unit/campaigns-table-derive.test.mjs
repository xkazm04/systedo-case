/** Direction 1 — CampaignTable stops recomputing the world
 *  (src/components/campaigns/table/derive.ts).
 *
 *  The table's view is derived in layers: the EXPENSIVE pass (withMetrics + the
 *  full triage rule engine per campaign + the portfolio summary) is
 *  `deriveCampaignRows`; the CHEAP passes (`filterCampaignRows`, `sortCampaignRows`)
 *  operate on its already-triaged output. These tests pin that split:
 *    1. the rule engine runs EXACTLY once per campaign (not the old double pass),
 *    2. the summary is byte-identical to the module's `summarize()`,
 *    3. filtering + sorting never re-triage (they carry the same `tr` by
 *       reference and don't touch the rule engine at all). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TARGET_ROAS, withMetrics } from "@/lib/campaigns/types";
import { triage, summarize } from "@/lib/campaigns/triage";
import {
  deriveCampaignRows,
  filterCampaignRows,
  sortCampaignRows,
} from "@/components/campaigns/table/derive";

/** A campaign at an EXACT roas (conversionValue = cost × roas). */
function campaign(id, roas, { cost = 10_000, status = "enabled", type = "search", name } = {}) {
  return {
    id,
    name: name ?? `Kampaň ${id}`,
    type,
    status,
    impressions: 50_000,
    clicks: 1_000,
    cost,
    conversions: roas > 0 ? 20 : 0,
    conversionValue: cost * roas,
  };
}

// A spread across the severity bands plus a paused-spender (critical) and a
// zero-return burner (critical) — enough to exercise every snapshot rule.
const CAMPAIGNS = [
  campaign("above", TARGET_ROAS * 1.2, { type: "search", name: "Alpha" }),
  campaign("mid", TARGET_ROAS * 0.9, { type: "shopping", name: "Bravo" }),
  campaign("deep", TARGET_ROAS * 0.4, { type: "search", name: "Charlie" }),
  campaign("paused", TARGET_ROAS * 1.5, { status: "paused", name: "Delta" }),
  campaign("burner", 0, { name: "Echo" }),
];

test("deriveCampaignRows runs the rule engine exactly once per campaign", () => {
  let calls = 0;
  const counting = (c, ch, g, h) => {
    calls++;
    return triage(c, ch, g, h);
  };
  const derived = deriveCampaignRows(CAMPAIGNS, {}, undefined, undefined, counting);
  // Once per row — NOT twice (the old code triaged in the rows map AND again
  // inside a separate summarize()).
  assert.equal(calls, CAMPAIGNS.length);
  assert.equal(derived.rows.length, CAMPAIGNS.length);
  assert.equal(derived.all.length, CAMPAIGNS.length);
});

test("derived summary is byte-identical to summarize()", () => {
  const all = CAMPAIGNS.map(withMetrics);
  const expected = summarize(all, {}, undefined, undefined);
  const { summary } = deriveCampaignRows(CAMPAIGNS, {}, undefined, undefined);
  assert.deepEqual(summary, expected);
  // Sanity: the fixture really does contain flagged rows.
  assert.ok(summary.attention >= 3);
  assert.equal(summary.critical + summary.warning + summary.ok, summary.total);
});

test("filter + sort never re-triage (they carry the derived rows by reference)", () => {
  let calls = 0;
  const counting = (c, ch, g, h) => {
    calls++;
    return triage(c, ch, g, h);
  };
  const { rows } = deriveCampaignRows(CAMPAIGNS, {}, undefined, undefined, counting);
  const afterDerive = calls;

  const filtered = filterCampaignRows(rows, {
    query: "a", // matches Alpha / Bravo / Charlie / Delta by name
    typeFilter: "all",
    statusFilter: "all",
    attentionOnly: false,
  });
  const sorted = sortCampaignRows(filtered, { key: "cost", dir: "desc" });

  // No further rule-engine calls happened in the cheap layers.
  assert.equal(calls, afterDerive);
  // The filtered/sorted rows are the SAME objects (triage result reused, not
  // recomputed).
  for (const r of sorted) assert.ok(rows.includes(r));
});

test("filter narrows on every dimension without recomputing rows", () => {
  const { rows } = deriveCampaignRows(CAMPAIGNS, {}, undefined, undefined);

  const searchName = filterCampaignRows(rows, {
    query: "alpha",
    typeFilter: "all",
    statusFilter: "all",
    attentionOnly: false,
  });
  assert.equal(searchName.length, 1);
  assert.equal(searchName[0].c.id, "above");

  const byType = filterCampaignRows(rows, {
    query: "",
    typeFilter: "shopping",
    statusFilter: "all",
    attentionOnly: false,
  });
  assert.deepEqual(
    byType.map((r) => r.c.id),
    ["mid"]
  );

  const paused = filterCampaignRows(rows, {
    query: "",
    typeFilter: "all",
    statusFilter: "paused",
    attentionOnly: false,
  });
  assert.deepEqual(
    paused.map((r) => r.c.id),
    ["paused"]
  );

  const flagged = filterCampaignRows(rows, {
    query: "",
    typeFilter: "all",
    statusFilter: "all",
    attentionOnly: true,
  });
  assert.ok(flagged.every((r) => r.tr.severity !== "ok"));
});

test("sortCampaignRows returns a new array and never mutates its input", () => {
  const { rows } = deriveCampaignRows(CAMPAIGNS, {}, undefined, undefined);
  const filtered = filterCampaignRows(rows, {
    query: "",
    typeFilter: "all",
    statusFilter: "all",
    attentionOnly: false,
  });
  const order = filtered.map((r) => r.c.id);
  const sorted = sortCampaignRows(filtered, { key: "cost", dir: "asc" });
  assert.notEqual(sorted, filtered); // fresh array
  assert.deepEqual(
    filtered.map((r) => r.c.id),
    order
  ); // input untouched
});
