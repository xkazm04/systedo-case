/** WP S1b — the pure half of query-level negatives: the recommender's thresholds and
 *  its ONE invariant, the model changes that let criterion moves ride the change-set
 *  envelope, and the row label the operator approves on.
 *
 *  THE INVARIANT, stated once: a search term with any conversions at all must never
 *  come back as a negative keyword. It is pinned twice below — as a table of explicit
 *  cases, and as a property loop over a 200-term random fixture — because it is the
 *  one failure in this WP that silently destroys revenue: a blocked converting query
 *  stops earning and nobody attributes the loss to us for weeks.
 *
 *  Everything here is pure. No store, no network, no mocks. */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  recommendTermMoves,
  isWastedTerm,
  isProvenTerm,
  TERM_MIN_SPEND_CZK,
  TERM_MIN_CLICKS,
  PROMOTE_MIN_CONVERSIONS,
} = await import("@/lib/campaigns/term-moves");
const { simulateBudgetShift, moveDonorShare, isCriterionMove } = await import("@/lib/campaigns/simulate");
const { checkPolicy, inverseMoves, hasRestoreSnapshots, settledRevertStatus, DEFAULT_POLICY } =
  await import("@/lib/campaigns/control-plane-types");
const { moveRowLabel, moveShowsValueGain } = await import("@/lib/campaigns/move-label");
const { withMetrics, TARGET_ROAS } = await import("@/lib/campaigns/types");

/** One stored search-term row. Defaults describe the acceptance fixture's negative. */
const term = (over = {}) => ({
  term: "levné boty",
  campaignId: "11",
  campaignName: "Kampaň A",
  adGroupId: "22",
  adGroupName: "Sestava B",
  matchType: "BROAD",
  cost: 900,
  clicks: 40,
  impressions: 1200,
  conversions: 0,
  conversionValue: 0,
  ...over,
});

// --- thresholds: the three acceptance rows -------------------------------------

test("[S1b] the three acceptance fixtures classify exactly as specified", () => {
  const moves = recommendTermMoves(
    [
      term({ term: "levné boty", cost: 900, clicks: 40, conversions: 0 }),
      term({ term: "boty na běh", cost: 3000, conversions: 3, conversionValue: 9000, matchType: "PHRASE" }),
      term({ term: "boty výprodej", cost: 900, clicks: 40, conversions: 1, conversionValue: 400 }),
    ],
    { maxMoves: 10 }
  );
  assert.deepEqual(
    moves.map((m) => [m.kind, m.criterion.term]),
    [
      ["negative", "levné boty"],
      ["promote", "boty na běh"],
    ],
    "cost 900 / 40 clicks / 0 conv → negative; 3000 / 3 conv / PHRASE → promote; ONE conversion → neither"
  );
});

test("[S1b] the thresholds are the documented constants", () => {
  assert.equal(TERM_MIN_SPEND_CZK, 500);
  assert.equal(TERM_MIN_CLICKS, 10);
  assert.equal(PROMOTE_MIN_CONVERSIONS, 2);
});

test("[S1b] a query below EITHER negative threshold is left alone", () => {
  // Under-spent: not worth a permanent criterion.
  assert.equal(isWastedTerm(term({ cost: 499 }), TERM_MIN_SPEND_CZK, TERM_MIN_CLICKS), false);
  // Under-clicked: "no conversions" on 9 clicks is noise, not evidence.
  assert.equal(isWastedTerm(term({ clicks: 9 }), TERM_MIN_SPEND_CZK, TERM_MIN_CLICKS), false);
  // Exactly on both thresholds: eligible (the gate is >=, stated).
  assert.equal(isWastedTerm(term({ cost: 500, clicks: 10 }), TERM_MIN_SPEND_CZK, TERM_MIN_CLICKS), true);
});

test("[S1b] an already-EXACT converting query is never promoted (it is already there)", () => {
  assert.equal(isProvenTerm(term({ conversions: 5, matchType: "EXACT" }), PROMOTE_MIN_CONVERSIONS), false);
  assert.equal(isProvenTerm(term({ conversions: 5, matchType: "BROAD" }), PROMOTE_MIN_CONVERSIONS), true);
  assert.equal(isProvenTerm(term({ conversions: 1, matchType: "BROAD" }), PROMOTE_MIN_CONVERSIONS), false);
});

// --- THE INVARIANT: a converting term is never a negative -----------------------

test("[S1b] INVARIANT (unit): a fractional conversion is enough to spare a query", () => {
  const moves = recommendTermMoves([term({ cost: 50_000, clicks: 900, conversions: 0.4 })], { maxMoves: 5 });
  assert.deepEqual(moves, [], "0.4 conversions is not zero — a rounded gate would have blocked this");
});

test("[S1b] INVARIANT (property): no negative over a 200-term random fixture converts", () => {
  // Deterministic LCG so a failure is reproducible from the seed alone.
  let seed = 20260829;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const terms = Array.from({ length: 200 }, (_, i) =>
    term({
      term: `dotaz ${i}`,
      campaignId: `c${i % 7}`,
      adGroupId: `g${i % 11}`,
      matchType: pick(["EXACT", "PHRASE", "BROAD", "OTHER"]),
      cost: Math.round(rnd() * 20_000),
      clicks: Math.round(rnd() * 500),
      // Deliberately dense around zero: whole zeros, fractions under one, and real
      // counts, so the boundary the invariant lives on is exercised, not skirted.
      conversions: pick([0, 0, 0, 0.1, 0.5, 0.9, 1, 2, 5, 17]),
      conversionValue: Math.round(rnd() * 50_000),
    })
  );

  // maxMoves high enough that the cap never hides a violation behind the slice.
  const moves = recommendTermMoves(terms, { maxMoves: 500 });
  const byKey = new Map(terms.map((t) => [`${t.campaignId} ${t.term}`, t]));
  let negatives = 0;
  for (const m of moves) {
    const src = byKey.get(`${m.criterion.campaignId} ${m.criterion.term}`);
    assert.ok(src, "every emitted move traces back to a fixture row");
    if (m.kind === "negative") {
      negatives += 1;
      assert.equal(src.conversions, 0, `"${m.criterion.term}" converted ${src.conversions} and was still blocked`);
      assert.ok(src.cost >= TERM_MIN_SPEND_CZK && src.clicks >= TERM_MIN_CLICKS);
    } else {
      assert.ok(src.conversions >= PROMOTE_MIN_CONVERSIONS);
      assert.notEqual(src.matchType, "EXACT");
    }
  }
  assert.ok(negatives > 0, "the fixture actually produced negatives — the loop is not vacuous");
});

test("[S1b] one term is never both a negative and a promote", () => {
  const moves = recommendTermMoves(
    [term({ conversions: 0 }), term({ conversions: 3, conversionValue: 1000 })],
    { maxMoves: 10 }
  );
  const keys = moves.map((m) => `${m.criterion.campaignId} ${m.criterion.term}`);
  assert.equal(new Set(keys).size, keys.length, "the dedupe speaks for a term exactly once");
});

test("[S1b] the same query under two ad groups yields ONE campaign-level negative", () => {
  const moves = recommendTermMoves(
    [term({ adGroupId: "22" }), term({ adGroupId: "23", adGroupName: "Sestava C" })],
    { maxMoves: 10 }
  );
  assert.equal(moves.length, 1, "a campaign-level criterion added twice is one API error");
});

test("[S1b] negatives come first, costliest first, then promotes by realized value", () => {
  const moves = recommendTermMoves(
    [
      term({ term: "p1", conversions: 2, conversionValue: 100, matchType: "PHRASE" }),
      term({ term: "n1", cost: 700 }),
      term({ term: "p2", conversions: 4, conversionValue: 9000, matchType: "BROAD" }),
      term({ term: "n2", cost: 5000 }),
    ],
    { maxMoves: 10 }
  );
  assert.deepEqual(moves.map((m) => m.criterion.term), ["n2", "n1", "p2", "p1"]);
});

test("[S1b] maxMoves is the blast radius, and 0 means nothing", () => {
  const terms = [term({ term: "a", cost: 9000 }), term({ term: "b", cost: 8000 }), term({ term: "c", cost: 7000 })];
  assert.equal(recommendTermMoves(terms, { maxMoves: 2 }).length, 2);
  assert.deepEqual(recommendTermMoves(terms, { maxMoves: 0 }), []);
  assert.deepEqual(recommendTermMoves([], { maxMoves: 3 }), []);
});

test("[S1b] the two money fields say what they mean", () => {
  const [neg] = recommendTermMoves([term({ cost: 900 })], { maxMoves: 1 });
  assert.equal(neg.amount, 900, "amount is the query's own period cost");
  assert.equal(neg.estValueGain, 0, "saved cost is NOT conversion value");
  assert.equal(neg.toId, "");
  assert.equal(neg.toName, "", "a negative has no recipient at all");

  const [pro] = recommendTermMoves(
    [term({ conversions: 3, conversionValue: 9000, matchType: "PHRASE" })],
    { maxMoves: 1 }
  );
  assert.equal(pro.estValueGain, 9000, "already-realized value: the projection is 'keep it'");
  assert.equal(pro.toId, "", "the ad group is NOT a campaign id");
  assert.equal(pro.toName, "Sestava B", "…it is the row's recipient label");
  assert.equal(pro.fromSource, "google-ads", "search terms only exist on the Google read");
});

// --- the model: criterion moves move no budget ---------------------------------

const ROWS = [
  withMetrics({
    id: "11",
    name: "Kampaň A",
    type: "search",
    status: "enabled",
    impressions: 50_000,
    clicks: 1_000,
    cost: 20_000,
    conversions: 20,
    conversionValue: Math.round(20_000 * TARGET_ROAS),
  }),
];

test("[S1b] simulateBudgetShift is an exact IDENTITY over criterion moves", () => {
  const moves = recommendTermMoves([term({ cost: 5_000 })], { maxMoves: 1 });
  assert.equal(moves.length, 1);
  const sim = simulateBudgetShift(ROWS, moves);
  assert.deepEqual(sim.after, sim.before, "blocking a query must not fake a portfolio lift");
  // …and specifically the donor campaign is untouched, even though fromId names it.
  assert.equal(sim.after.cost, 20_000);
});

test("[S1b] a criterion move never degrades projection confidence", () => {
  const [m] = recommendTermMoves([term({ cost: 19_000 })], { maxMoves: 1 });
  assert.equal(isCriterionMove(m), true);
  assert.equal(moveDonorShare({ ...m, fromCost: 100 }), 0, "it re-points no share of any donor");
});

test("[S1b] checkPolicy names the query, not a phantom budget transfer", () => {
  const [neg] = recommendTermMoves([term({ cost: 60_000 })], { maxMoves: 1 });
  const [pro] = recommendTermMoves(
    [term({ term: "boty na běh", cost: 60_000, conversions: 3, conversionValue: 1, matchType: "PHRASE" })],
    { maxMoves: 1 }
  );
  const v = checkPolicy([neg, pro], DEFAULT_POLICY);
  assert.equal(v.length, 2);
  assert.match(v[0], /Vyloučení dotazu „levné boty“/);
  assert.match(v[1], /Přidání klíčového slova „boty na běh“/);
  assert.ok(
    v.every((s) => !s.includes("→")),
    "neither reads as budget moving between campaigns, because none does"
  );
});

test("[S1b] a criterion move cannot breach the cross-network guardrail", () => {
  const [m] = recommendTermMoves([term({ cost: 100 })], { maxMoves: 1, minSpend: 0, minClicks: 0 });
  assert.deepEqual(checkPolicy([{ ...m, toSource: "sklik" }], DEFAULT_POLICY), [], "no recipient, no cross-network");
});

test("[S1b] inverseMoves now CARRIES the kind (it used to drop it)", () => {
  const [neg] = recommendTermMoves([term()], { maxMoves: 1 });
  const [inv] = inverseMoves([neg]);
  assert.equal(inv.kind, "negative");
  assert.deepEqual(inv.criterion, neg.criterion, "an inverse that cannot name the query names nothing");

  const [pause] = inverseMoves([{ kind: "pause", fromId: "a", fromName: "A", toId: "", toName: "", amount: 1, fromRoas: 0, toRoas: 0, estValueGain: 0 }]);
  assert.equal(pause.kind, "pause", "a pause no longer inverts into something that looks like a shift");
});

test("[S1b] a legacy kind-less move still inverts BYTE-IDENTICALLY", () => {
  const legacy = { fromId: "a", fromName: "A", toId: "b", toName: "B", amount: 100, fromRoas: 1, toRoas: 2, estValueGain: 50 };
  assert.deepEqual(inverseMoves([legacy])[0], {
    fromId: "b",
    fromName: "B",
    toId: "a",
    toName: "A",
    amount: 100,
    fromRoas: 2,
    toRoas: 1,
    estValueGain: -50,
  });
});

// --- revert gating -------------------------------------------------------------

test("[S1b] a CRITERION-ONLY set is revertable (it would have been stranded before)", () => {
  assert.equal(hasRestoreSnapshots({ criterionSnapshots: [{ resourceName: "x" }] }), true);
  assert.equal(hasRestoreSnapshots({ budgetSnapshots: [], statusSnapshots: [], criterionSnapshots: [] }), false);
  assert.equal(hasRestoreSnapshots({}), false);
});

test("[S1b] settledRevertStatus gains a third flag and defaults it true", () => {
  assert.equal(settledRevertStatus(true, true), "reverted", "budget-only callers are unchanged");
  assert.equal(settledRevertStatus(true, true, true), "reverted");
  assert.equal(settledRevertStatus(true, true, false), "applied", "a criterion left behind is not a revert");
  assert.equal(settledRevertStatus(false, true, true), "applied");
});

// --- the row an operator approves on -------------------------------------------

test("[S1b] moveRowLabel gives four visibly distinct shapes", () => {
  const [neg] = recommendTermMoves([term()], { maxMoves: 1 });
  const [pro] = recommendTermMoves(
    [term({ term: "boty na běh", conversions: 3, conversionValue: 1, matchType: "PHRASE" })],
    { maxMoves: 1 }
  );
  const shift = { fromName: "Kampaň A", toName: "Kampaň B", toId: "b", fromId: "a", amount: 1, fromRoas: 1, toRoas: 2, estValueGain: 1 };
  const pause = { ...shift, kind: "pause", toName: "" };

  const labels = [moveRowLabel(shift), moveRowLabel(pause), moveRowLabel(neg), moveRowLabel(pro)];
  assert.deepEqual(labels, [
    "Kampaň A → Kampaň B",
    "⏸ Kampaň A",
    "− „levné boty“ (Kampaň A)",
    "+ „boty na běh“ [exact] (Sestava B)",
  ]);
  assert.equal(new Set(labels).size, 4, "four kinds, four shapes");
});

test("[S1b] the pause row no longer renders an arrow to nowhere", () => {
  const pause = { kind: "pause", fromId: "a", fromName: "Kampaň A", toId: "", toName: "", amount: 1, fromRoas: 0, toRoas: 0, estValueGain: 0 };
  assert.equal(moveRowLabel(pause).includes("→"), false, "the pre-S1b row printed 'Kampaň A → '");
});

test("[S1b] only a negative hides its value figure", () => {
  const [neg] = recommendTermMoves([term()], { maxMoves: 1 });
  const [pro] = recommendTermMoves([term({ conversions: 3, conversionValue: 1, matchType: "PHRASE" })], { maxMoves: 1 });
  assert.equal(moveShowsValueGain(neg), false, "'+0 Kč' would read as 'worth nothing'");
  assert.equal(moveShowsValueGain(pro), true);
  assert.equal(moveShowsValueGain({ kind: "pause" }), true);
  assert.equal(moveShowsValueGain({}), true, "a legacy move is unchanged");
});
