/** Direction 2 — pinned patterns stop being immortal. The pure contradiction check
 *  (src/lib/patterns/extract.ts) re-derives an identifiable pin's subject from fresh
 *  mined data and flags it when the claim no longer holds; kinds without a re-checkable
 *  subject are EXEMPT and stay unflagged. Plus the prompt-exclusion composition and the
 *  round-7-style age label (src/lib/patterns/age.ts). All pure — no store, no clock. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { contradictedSavedIds } from "@/lib/patterns/extract";
import { formatPatternAge, patternAgeDays } from "@/lib/patterns/age";
import { PAID_PORTFOLIO_TARGET_PNO } from "@/lib/targets";

// targetRoas at the default 18 % PNO ≈ 5.56×.
const camp = (name, type, cost, value, status = "enabled") => ({
  id: name,
  name,
  type,
  status,
  impressions: 10_000,
  clicks: 500,
  cost,
  conversions: 20,
  conversionValue: value,
});
const saved = (title, category) => ({
  id: `s-${title}`,
  title,
  category,
  insight: "…",
  evidence: "…",
  source: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
});
const ctx = (campaigns, channels = []) => ({
  campaigns,
  channels,
  pnoGoal: PAID_PORTFOLIO_TARGET_PNO,
});

// --- scaling template (budget, names a campaign) ------------------------------

test("scaling pin: FIRES when its campaign now reads below target ROAS", () => {
  const s = saved('Vzor pro škálování: „Kampaň A"', "budget");
  const belowTarget = ctx([camp("Kampaň A", "search", 10_000, 30_000)]); // ROAS 3.0 < 5.56
  assert.ok(contradictedSavedIds([s], belowTarget).has(s.id));
});

test("scaling pin: does NOT fire while its campaign still clears target", () => {
  const s = saved('Vzor pro škálování: „Kampaň A"', "budget");
  const aboveTarget = ctx([camp("Kampaň A", "search", 10_000, 70_000)]); // ROAS 7.0 > 5.56
  assert.ok(!contradictedSavedIds([s], aboveTarget).has(s.id));
});

test("scaling pin: a vanished campaign is not flagged (can't judge → conservative)", () => {
  const s = saved('Vzor pro škálování: „Kampaň A"', "budget");
  const other = ctx([camp("Kampaň Z", "search", 10_000, 30_000)]);
  assert.ok(!contradictedSavedIds([s], other).has(s.id));
});

// --- best-performing type (structure, names a type) ---------------------------

test("best-type pin: FIRES when that type's fresh aggregate falls below target", () => {
  const s = saved("Search je nejefektivnější typ", "structure");
  const weakSearch = ctx([camp("s1", "search", 10_000, 20_000)]); // ROAS 2.0
  assert.ok(contradictedSavedIds([s], weakSearch).has(s.id));
});

test("best-type pin: holds while that type still clears target", () => {
  const s = saved("Search je nejefektivnější typ", "structure");
  const strongSearch = ctx([camp("s1", "search", 10_000, 80_000)]); // ROAS 8.0
  assert.ok(!contradictedSavedIds([s], strongSearch).has(s.id));
});

// --- over-performing channel (targeting) is now EXEMPT ------------------------
// The distribution module is sample-only (no live per-tenant channel-performance
// source), so a channel pin could only be judged against demo CTRs — which would
// falsely contradict a true lesson. Targeting pins are therefore never flagged.

test("over-channel pin: EXEMPT — never flagged (no live channel source to judge it)", () => {
  const s = saved("Nadvýkonný kanál: Newsletter", "targeting");
  // Even with fresh campaigns present, a targeting pin is not judged.
  assert.ok(!contradictedSavedIds([s], ctx([camp("x", "search", 1, 1)])).has(s.id));
});

// --- exempt kinds (no re-checkable positive subject) --------------------------

test("exempt kinds are never flagged, even against contradicting data", () => {
  const exempts = [
    saved('Past na rozpočet: profil „Kampaň A"', "budget"),
    saved("Brandové vyhledávání jako efektivní základ", "structure"),
    saved('Vítězný úhel: „Zdarma navždy" (CRM)', "creative"),
    saved("Portfolio plní cílové PNO", "trend"),
    saved("Podvýkonný kanál: Newsletter", "targeting"),
    saved("Moje vlastní ručně psaná poučka", "structure"),
  ];
  // Data that would contradict a like-named positive claim.
  const c = ctx(
    [camp("Kampaň A", "search", 10_000, 20_000)],
    [
      { channel: "Newsletter", reach: 10_000, clicks: 200 },
      { channel: "LinkedIn", reach: 10_000, clicks: 1_500 },
      { channel: "Instagram", reach: 10_000, clicks: 2_000 },
    ]
  );
  assert.equal(contradictedSavedIds(exempts, c).size, 0);
});

test("no fresh campaign data → nothing is flagged (a pin can't be contradicted by nothing)", () => {
  const s = saved('Vzor pro škálování: „Kampaň A"', "budget");
  assert.equal(contradictedSavedIds([s], ctx([])).size, 0);
});

// --- prompt exclusion (getPatternLines composition) ---------------------------

test("prompt exclusion: a contradicted pin is dropped from the prompt line set", () => {
  const good = saved('Vzor pro škálování: „Kampaň A"', "budget");
  const stale = saved('Vzor pro škálování: „Kampaň B"', "budget");
  const c = ctx([
    camp("Kampaň A", "search", 10_000, 70_000), // ROAS 7 — holds
    camp("Kampaň B", "search", 10_000, 20_000), // ROAS 2 — contradicted
  ]);
  const flagged = contradictedSavedIds([good, stale], c);
  const annotated = [good, stale].map((p) => (flagged.has(p.id) ? { ...p, contradicted: true } : p));
  // The same filter getPatternLines applies:
  const forPrompt = annotated.filter((p) => !p.contradicted);
  assert.deepEqual(
    forPrompt.map((p) => p.id),
    [good.id]
  );
});

// --- age label (round-7 buckets, cs/en) ---------------------------------------

test("formatPatternAge: buckets days/weeks/months with Czech instrumental + English", () => {
  const now = new Date("2026-07-15T00:00:00.000Z");
  const at = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
  assert.equal(formatPatternAge(at(0), "cs", now), "dnes");
  assert.equal(formatPatternAge(at(0), "en", now), "today");
  assert.equal(formatPatternAge(at(1), "cs", now), "před 1 dnem");
  assert.equal(formatPatternAge(at(3), "cs", now), "před 3 dny");
  assert.equal(formatPatternAge(at(21), "cs", now), "před 3 týdny");
  assert.equal(formatPatternAge(at(90), "cs", now), "před 3 měsíci");
  assert.equal(formatPatternAge(at(90), "en", now), "3 months ago");
  assert.equal(formatPatternAge(at(7), "en", now), "7 days ago");
});

test("formatPatternAge: empty/unparseable stamp → '' (auto patterns carry no createdAt)", () => {
  assert.equal(formatPatternAge("", "cs"), "");
  assert.equal(formatPatternAge("not-a-date", "en"), "");
  assert.ok(Number.isNaN(patternAgeDays("")));
});
