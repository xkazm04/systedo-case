/** Pauses enter the governance envelope (src/lib/campaigns/control-plane-types.ts
 *  + budget-moves.ts): the control-plane bundle now includes pause moves, and the
 *  shared guardrail policy (checkPolicy) evaluates every move — pause and shift —
 *  with a move-appropriate breach message. Pure model only (no firebase). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TARGET_ROAS, withMetrics } from "@/lib/campaigns/types";
import { recommendBudgetMoves } from "@/lib/campaigns/budget-moves";
import { checkPolicy, DEFAULT_POLICY } from "@/lib/campaigns/control-plane-types";

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

test("the control-plane bundle (includePauses) surfaces a zero-return burner as a pause move", () => {
  const rows = [
    row("z1", { cost: 8_000, roasFactor: 0 }), // no_conversions burner
    row("w1", { cost: 20_000, roasFactor: 1.4 }), // over-performer
  ];
  const { moves } = recommendBudgetMoves(rows, { maxMoves: 3, includePauses: true });
  const pause = moves.find((m) => m.kind === "pause");
  assert.ok(pause, "a pause move is bundled into the change-set");
  assert.equal(pause.fromId, "z1");
  assert.equal(pause.amount, 8_000);
});

test("checkPolicy evaluates pause moves and words the breach as a pause, not a shift", () => {
  const bigPause = {
    kind: "pause",
    fromId: "z1",
    fromName: "Burner",
    toId: "",
    toName: "",
    amount: DEFAULT_POLICY.maxMoveAmountCzk + 1,
    fromRoas: 0,
    toRoas: 0,
    estValueGain: 0,
  };
  const violations = checkPolicy([bigPause], DEFAULT_POLICY);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /Pozastavení/);
  assert.doesNotMatch(violations[0], /Přesun/);
});

test("checkPolicy still words a shift breach as a shift", () => {
  const bigShift = {
    kind: "shift",
    fromId: "a",
    fromName: "A",
    toId: "b",
    toName: "B",
    amount: DEFAULT_POLICY.maxMoveAmountCzk + 1,
    fromRoas: 1,
    toRoas: 6,
    estValueGain: 100,
  };
  const violations = checkPolicy([bigShift], DEFAULT_POLICY);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /Přesun/);
});

test("a within-limit bundle of shift + pause passes the guardrail", () => {
  const moves = [
    { kind: "shift", fromId: "a", fromName: "A", toId: "b", toName: "B", amount: 1_000, fromRoas: 1, toRoas: 6, estValueGain: 50 },
    { kind: "pause", fromId: "z", fromName: "Z", toId: "", toName: "", amount: 2_000, fromRoas: 0, toRoas: 0, estValueGain: 0 },
  ];
  assert.deepEqual(checkPolicy(moves, DEFAULT_POLICY), []);
});
