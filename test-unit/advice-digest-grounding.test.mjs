/** WP W3-A — the two SURFACES the advice ledger reaches, byte-pinned.
 *
 *   1. the weekly digest section (src/lib/advice/digest.ts + the W2-E change-set
 *      bridge in src/lib/advice/changesets.ts), which must degrade to "" rather than
 *      print an empty "Výsledky rad" heading;
 *   2. the monthly-recap grounding line (`adviceOutcomesGroundingText`), pinned
 *      byte-for-byte in cs AND en — it rides the recap's user prompt, so a silent
 *      reword is a silent change to what every recap is told.
 *
 *  Pure — no store, no cron, no LLM. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);
const { updateAdviceLedger } = await import("@/lib/advice/ledger");
const { adviceOutcomeRows, adviceRowLine, renderAdviceOutcomes } = await import("@/lib/advice/digest");
const { changeSetOutcomeRows, changeSetOutcomesGroundingText } = await import("@/lib/advice/changesets");
const { adviceOutcomesGroundingText } = await import("@/lib/report/recap-context");

const T0 = "2026-08-01T09:00:00.000Z";
const day = (n) => new Date(Date.parse(T0) + n * 86_400_000);

const sighting = (subjectKey, title, key, value, over = {}) => ({
  subjectKey,
  module: "zisk",
  severity: "warning",
  title,
  snapshot: { key, value },
  ...over,
});

/** Two scored outcomes: one improved (poas 1 → 2), one worse (ltvCac 4 → 2). */
function twoOutcomeLedger() {
  let l = updateAdviceLedger(
    null,
    [
      sighting("zisk:unprofitable-channel:sklik", "Sklik prodělává po marži", "poas", 1),
      sighting("ltv:ltv-cac-below-target", "LTV:CAC pod cílem", "ltvCac", 4),
    ],
    day(0)
  );
  l = updateAdviceLedger(
    l,
    [
      sighting("zisk:unprofitable-channel:sklik", "Sklik prodělává po marži", "poas", 2),
      sighting("ltv:ltv-cac-below-target", "LTV:CAC pod cílem", "ltvCac", 2),
    ],
    day(1)
  );
  // Both go quiet; day 5 is past the 3-day resolve clock.
  return updateAdviceLedger(l, [], day(5));
}

// --- digest section ---------------------------------------------------------

test("ACCEPTANCE: one scored outcome renders the title AND the signed delta", () => {
  const rows = adviceOutcomeRows(twoOutcomeLedger(), day(5)).slice(0, 1);
  assert.equal(rows.length, 1);
  const { alertBody, html } = renderAdviceOutcomes(rows);
  assert.ok(html.includes("Výsledky rad"), "the section has its heading");
  assert.ok(html.includes("Sklik prodělává po marži"), "the advice title is in the row");
  assert.ok(html.includes("zlepšeno"), "the verdict word is Czech (the digest is cs-only)");
  assert.ok(/\+\s?100/.test(html), `the signed delta is rendered: ${html}`);
  assert.ok(html.includes("poas"), "the metric is named, so the number is never anonymous");
  assert.ok(alertBody.includes("Rada „Sklik prodělává po marži“"), alertBody);
});

test("ACCEPTANCE: zero outcomes degrade to \"\" — no heading over an empty list", () => {
  assert.deepEqual(renderAdviceOutcomes([]), { alertBody: "", html: "" });
  assert.deepEqual(adviceOutcomeRows(null, day(5)), []);
  assert.deepEqual(adviceOutcomeRows({ records: [], updatedAt: "" }, day(5)), []);
  // An OPEN ledger (advice still showing) is not an outcome either.
  const open = updateAdviceLedger(null, [sighting("a", "A", "poas", 1)], day(0));
  assert.deepEqual(renderAdviceOutcomes(adviceOutcomeRows(open, day(0))), { alertBody: "", html: "" });
});

test("the digest section never contains SAMPLE-derived advice", () => {
  let l = updateAdviceLedger(null, [sighting("s", "Ukázka", "poas", 1, { sample: true })], day(0));
  l = updateAdviceLedger(l, [sighting("s", "Ukázka", "poas", 9, { sample: true })], day(1));
  l = updateAdviceLedger(l, [], day(5));
  assert.deepEqual(adviceOutcomeRows(l, day(5)), [], "a fixture outcome must never reach a client email");
});

test("an 'unchanged' row prints the words, and a metric-less row prints no percentage", () => {
  assert.equal(
    adviceRowLine({ title: "Rada „X“", status: "unchanged", deltaPct: 0.01, metricKey: "poas" }),
    "Rada „X“ — beze změny (poas +1,0 %)"
  );
  assert.equal(
    adviceRowLine({ title: "Rada „X“", status: "worse", deltaPct: null }),
    "Rada „X“ — zhoršeno"
  );
});

test("the section html escapes an advice title, so a product name can never inject markup", () => {
  const { html } = renderAdviceOutcomes([
    { title: 'Rada „<img src=x onerror=1>“', status: "improved", deltaPct: 0.5, metricKey: "poas" },
  ]);
  assert.ok(!html.includes("<img"), html);
  assert.ok(html.includes("&lt;img"), html);
});

// --- W2-E change-set bridge -------------------------------------------------

const changeSet = (id, over = {}) => {
  const { realized, ...rest } = over;
  return {
  id,
  createdAt: T0,
  status: "applied",
  moves: [],
  simulation: {},
  policy: {},
  violations: [],
  approvedAt: T0,
  revertedAt: null,
  results: null,
  realized: {
    status: "measured",
    computedAt: day(4).toISOString(),
    windowDays: 7,
    daysCovered: { before: 7, after: 7 },
    campaigns: [],
    realizedValueDelta: 12_000,
    projectedValueGain: 20_000,
    ratio: 0.6,
    ...(realized ?? {}),
  },
  ...rest,
  };
};

test("a MEASURED realization becomes a row carrying both koruna numbers", () => {
  const [row] = changeSetOutcomeRows([changeSet("cs1")], day(5), "cs");
  assert.equal(row.status, "improved", "the verdict reads the realized value delta");
  assert.ok(row.title.startsWith("Změna rozpočtu"), row.title);
  assert.ok(row.title.includes("vs. projekce"), row.title);
  assert.ok(Math.abs(row.deltaPct - -0.4) < 1e-9, "the percentage reads ratio − 1");
  assert.equal(row.metricKey, "vs. projekce");
});

test("an INSUFFICIENT realization is silent — 'we could not measure' is not 'nothing happened'", () => {
  const insufficient = changeSet("cs2", { realized: { status: "insufficient" } });
  assert.deepEqual(changeSetOutcomeRows([insufficient], day(5), "cs"), []);
  assert.deepEqual(changeSetOutcomesGroundingText([insufficient], "cs", day(5)), "");
});

test("a pending / reverted set and an out-of-window measurement are both skipped", () => {
  assert.deepEqual(changeSetOutcomeRows([changeSet("p", { status: "pending" })], day(5), "cs"), []);
  assert.deepEqual(changeSetOutcomeRows([changeSet("r", { status: "reverted" })], day(5), "cs"), []);
  assert.deepEqual(changeSetOutcomeRows([changeSet("old")], day(40), "cs", 7), [], "past the window");
});

test("a null ratio (non-positive projection) carries NO percentage rather than an invented one", () => {
  const [row] = changeSetOutcomeRows(
    [changeSet("n", { realized: { ratio: null, projectedValueGain: 0, realizedValueDelta: -500 } })],
    day(5),
    "cs"
  );
  assert.equal(row.deltaPct, null);
  assert.equal(row.metricKey, undefined);
  assert.equal(row.status, "worse");
});

test("the change-set row and its grounding sentence both localize", () => {
  const [en] = changeSetOutcomeRows([changeSet("e")], day(5), "en");
  assert.ok(en.title.startsWith("Budget change"), en.title);
  assert.ok(changeSetOutcomesGroundingText([changeSet("e")], "en", day(5)).startsWith("Measured outcomes"));
  assert.ok(changeSetOutcomesGroundingText([changeSet("e")], "cs", day(5)).startsWith("Změřené výsledky"));
  assert.equal(changeSetOutcomesGroundingText([], "cs", day(5)), "", "nothing measured → nothing said");
});

// --- recap grounding, byte-pinned ------------------------------------------

test("ACCEPTANCE: adviceOutcomesGroundingText is byte-pinned for a 2-outcome fixture (cs)", () => {
  assert.equal(
    adviceOutcomesGroundingText(twoOutcomeLedger(), "cs"),
    "Výsledky rad, které aplikace už dala: „Sklik prodělává po marži“ — zlepšeno (poas +100,0 %); „LTV:CAC pod cílem“ — zhoršeno (ltvCac −50,0 %). Měřeno na vlastní metrice signálu mezi prvním a posledním zobrazením doporučení. Napiš, zda se rady promítly do čísel; nikdy netvrď výsledek, který v tomto seznamu není."
  );
});

test("ACCEPTANCE: adviceOutcomesGroundingText is byte-pinned for the same fixture (en)", () => {
  assert.equal(
    adviceOutcomesGroundingText(twoOutcomeLedger(), "en"),
    "Outcomes of the advice this app already gave: “Sklik prodělává po marži” — improved (poas +100.0%); “LTV:CAC pod cílem” — worse (ltvCac −50.0%). These are measured on the signal's own metric between the first and last time the recommendation was shown. Say whether the advice moved the numbers; never claim a result that is not in this list."
  );
});

test("the grounding is \"\" with nothing scored, so the recap prompt stays byte-identical", () => {
  assert.equal(adviceOutcomesGroundingText(null, "cs"), "");
  assert.equal(adviceOutcomesGroundingText(undefined, "en"), "");
  assert.equal(adviceOutcomesGroundingText({ records: [], updatedAt: "" }, "cs"), "");
  const open = updateAdviceLedger(null, [sighting("a", "A", "poas", 1)], day(0));
  assert.equal(adviceOutcomesGroundingText(open, "cs"), "", "open advice is not a result");
});

test("the grounding never narrates a SAMPLE outcome", () => {
  let l = updateAdviceLedger(null, [sighting("s", "Ukázka", "poas", 1, { sample: true })], day(0));
  l = updateAdviceLedger(l, [sighting("s", "Ukázka", "poas", 9, { sample: true })], day(1));
  l = updateAdviceLedger(l, [], day(5));
  assert.equal(adviceOutcomesGroundingText(l, "cs"), "");
});

test("the grounding caps the list rather than pasting a transcript", () => {
  const many = [];
  for (let i = 0; i < 9; i++) many.push(sighting(`k${i}`, `Rada ${i}`, "poas", 1));
  let l = updateAdviceLedger(null, many, day(0));
  l = updateAdviceLedger(l, many.map((s) => ({ ...s, snapshot: { key: "poas", value: 4 } })), day(1));
  l = updateAdviceLedger(l, [], day(5));
  const text = adviceOutcomesGroundingText(l, "cs");
  assert.equal((text.match(/zlepšeno/g) ?? []).length, 4, `expected a 4-item cap: ${text}`);
});
