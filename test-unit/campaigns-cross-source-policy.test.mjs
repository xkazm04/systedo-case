/** WP S1 — the pure half: moves carry their network, the guardrail refuses a
 *  cross-network shift by default, and the snapshot union reads legacy blobs as
 *  Google. No I/O, no mocks. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { checkPolicy, DEFAULT_POLICY, inverseMoves, normalizeBudgetSnapshot, partitionBudgetSnapshots, changeSetSource } =
  await import("@/lib/campaigns/control-plane-types");
const { dedupeSnapshots, dedupeSklikSnapshots, czkToMicros } = await import("@/lib/campaigns/budget-math");
const { recommendBudgetMoves } = await import("@/lib/campaigns/budget-moves");
const { withMetrics, TARGET_ROAS } = await import("@/lib/campaigns/types");

const shift = (over) => ({
  kind: "shift",
  fromId: "a",
  fromName: "A",
  toId: "b",
  toName: "B",
  amount: 1000,
  fromRoas: 1,
  toRoas: 5,
  estValueGain: 4000,
  ...over,
});

// --- the cross-source guardrail -------------------------------------------------

test("[S1] RED: a mixed-source shift breaches the policy by default", () => {
  const v = checkPolicy([shift({ fromSource: "google-ads", toSource: "sklik" })], DEFAULT_POLICY);
  assert.deepEqual(v, ["Přesun mezi sítěmi (Google ↔ Sklik) není povolený."]);
  assert.equal(DEFAULT_POLICY.crossSource, undefined, "absent = off — the default policy never opts in");
});

test("[S1] GREEN: the same move passes with crossSource: true", () => {
  const v = checkPolicy(
    [shift({ fromSource: "google-ads", toSource: "sklik" })],
    { ...DEFAULT_POLICY, crossSource: true }
  );
  assert.deepEqual(v, []);
});

test("[S1] a same-network shift, a source-less legacy move and a pause never breach it", () => {
  assert.deepEqual(checkPolicy([shift({ fromSource: "sklik", toSource: "sklik" })], DEFAULT_POLICY), []);
  assert.deepEqual(checkPolicy([shift({})], DEFAULT_POLICY), [], "a move that carries no sources is not judged");
  assert.deepEqual(checkPolicy([shift({ fromSource: "google-ads" })], DEFAULT_POLICY), [], "one end is not enough to judge");
  assert.deepEqual(
    checkPolicy([shift({ kind: "pause", fromSource: "google-ads", toSource: "sklik", toId: "", toName: "" })], DEFAULT_POLICY),
    [],
    "a pause has no recipient, so it cannot be a cross-network move"
  );
});

test("[S1] the cross-source breach stacks with the existing guardrails, it does not replace them", () => {
  const v = checkPolicy(
    [shift({ amount: 99_999, fromSource: "google-ads", toSource: "sklik" })],
    DEFAULT_POLICY
  );
  assert.equal(v.length, 2, "both the network breach and the amount breach are reported");
  assert.ok(v.some((s) => s.includes("mezi sítěmi")));
  assert.ok(v.some((s) => s.includes("překračuje limit")));
});

test("[S1] inverseMoves swaps the networks with the campaigns, and stays byte-identical without them", () => {
  const [inv] = inverseMoves([shift({ fromSource: "google-ads", toSource: "sklik" })]);
  assert.equal(inv.fromSource, "sklik");
  assert.equal(inv.toSource, "google-ads");
  const [legacy] = inverseMoves([shift({})]);
  assert.equal("fromSource" in legacy, false, "a pre-S1 move inverts with no new keys");
  assert.equal("toSource" in legacy, false);
});

// --- the recommender stamps the sources -----------------------------------------

function row(id, { cost, roasFactor, source }) {
  return withMetrics({
    id,
    name: `Kampaň ${id}`,
    type: "search",
    status: "enabled",
    impressions: 10_000,
    clicks: 500,
    cost,
    conversions: roasFactor > 0 ? 10 : 0,
    conversionValue: Math.round(cost * TARGET_ROAS * roasFactor),
    ...(source ? { source } : {}),
  });
}

test("[S1] recommendBudgetMoves stamps fromSource/toSource off the rows", () => {
  const { moves } = recommendBudgetMoves(
    [
      row("z", { cost: 5_000, roasFactor: 0, source: "sklik" }),
      row("d", { cost: 20_000, roasFactor: 0.5, source: "google-ads" }),
      row("w", { cost: 20_000, roasFactor: 1.4, source: "sklik" }),
    ],
    { includePauses: true }
  );
  const s = moves.find((m) => m.kind === "shift");
  const p = moves.find((m) => m.kind === "pause");
  assert.equal(s.fromSource, "google-ads");
  assert.equal(s.toSource, "sklik");
  assert.equal(p.fromSource, "sklik");
  assert.equal("toSource" in p, false, "a pause has no recipient to attribute");
  assert.deepEqual(
    checkPolicy([s], DEFAULT_POLICY),
    ["Přesun mezi sítěmi (Google ↔ Sklik) není povolený."],
    "a union portfolio's mixed pairing is caught the moment such a set can exist"
  );
});

test("[S1] source-less rows produce byte-identical, source-less moves", () => {
  const { moves } = recommendBudgetMoves(
    [row("d", { cost: 20_000, roasFactor: 0.5 }), row("w", { cost: 20_000, roasFactor: 1.4 })],
    {}
  );
  assert.equal(moves.length, 1);
  assert.equal("fromSource" in moves[0], false);
  assert.equal("toSource" in moves[0], false);
});

// --- the snapshot union ---------------------------------------------------------

const LEGACY = { budgetResourceName: "budgets/A", prevMicros: 100 };
const SKLIK = { platform: "sklik", campaignId: "101", prevDayBudgetCzk: 1000 };

test("[S1] a snapshot with no platform key reads as Google — the legacy contract", () => {
  assert.deepEqual(normalizeBudgetSnapshot(LEGACY), LEGACY, "read back unchanged, not rewritten");
  assert.deepEqual(normalizeBudgetSnapshot(SKLIK), SKLIK);
  const { google, sklik } = partitionBudgetSnapshots([LEGACY, SKLIK, { platform: "google-ads", ...LEGACY }]);
  assert.equal(google.length, 2, "explicit google-ads and absent both land in the Google group");
  assert.equal(sklik.length, 1);
});

test("[S1] each platform de-dupes on its OWN natural key — same id, different networks", () => {
  // A Google budget resource and a Sklik campaign can both be called "101"; the
  // partition is what keeps them from colliding in one map.
  const g = dedupeSnapshots([
    { budgetResourceName: "101", prevMicros: 100 },
    { budgetResourceName: "101", prevMicros: 999 },
  ]);
  const s = dedupeSklikSnapshots([
    { platform: "sklik", campaignId: "101", prevDayBudgetCzk: 50 },
    { platform: "sklik", campaignId: "101", prevDayBudgetCzk: 999 },
  ]);
  assert.equal(g.get("101"), 100, "first (prior-most) wins, unchanged");
  assert.equal(s.get("101"), 50, "and independently on the Sklik side");
  assert.equal(dedupeSklikSnapshots([]).size, 0);
});

test("[S1] czkToMicros is the exact lift both networks plan through", () => {
  assert.equal(czkToMicros(1000), 1_000_000_000);
  assert.equal(czkToMicros(0), 0);
  assert.equal(czkToMicros(0.5), 500_000);
});

// --- what the console reads ------------------------------------------------------

test("[S1] changeSetSource prefers the moves' stamp, then the platform tags, else undefined", () => {
  assert.equal(changeSetSource({ moves: [shift({ fromSource: "sklik", toSource: "sklik" })] }), "sklik");
  assert.equal(changeSetSource({ moves: [shift({ fromSource: "google-ads", toSource: "google-ads" })] }), "google-ads");
  assert.equal(changeSetSource({ moves: [shift({})], results: [{ ok: true, platform: "sklik" }] }), "sklik");
  assert.equal(changeSetSource({ moves: [shift({})], budgetSnapshots: [SKLIK] }), "sklik");
  assert.equal(changeSetSource({ moves: [shift({})], statusSnapshots: [{ campaignId: "1", campaignName: "x", prevStatus: "enabled", platform: "sklik" }] }), "sklik");
  assert.equal(
    changeSetSource({ moves: [shift({})], budgetSnapshots: [LEGACY] }),
    undefined,
    "a legacy set says nothing rather than asserting Google — the console just shows no pill"
  );
});
