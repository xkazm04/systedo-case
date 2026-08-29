/** WP W3-C — the conversion ledger's PURE half: which stage transitions mint a row,
 *  which deliberately mint nothing, the upsert id that makes a re-qualify harmless,
 *  and the rollup (30-day window, per-source split, gclid coverage).
 *
 *  No database and no clock: every instant is passed in, which is the whole reason
 *  the detectors live in a pure module. */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  CONVERSION_EVENT_CAP,
  CONVERSION_RETENTION_DAYS,
  conversionEventId,
  conversionFromApply,
  conversionFromStageChange,
  conversionValue,
  gclidCoverage,
  isConversionKind,
  retentionCutoffDay,
  summarizeConversions,
  windowStartDay,
} = await import("@/lib/leads/conversion-events");

const NOW = new Date("2026-08-30T09:15:00.000Z");

const contact = (over = {}) => ({
  id: "c1",
  projectId: "p1",
  name: "Jan Novák",
  email: "jan@firma.cz",
  phone: "+420777123456",
  stage: "qualified",
  stageEnteredAt: NOW.toISOString(),
  attribution: { source: "google-ads", campaign: "Brand", gclid: "GCL123" },
  consent: [],
  tags: [],
  firstSeenAt: "2026-08-01T00:00:00.000Z",
  lastActivityAt: NOW.toISOString(),
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: NOW.toISOString(),
  ...over,
});

test("working → qualified mints exactly ONE qualified row, with the display label", () => {
  const rows = conversionFromStageChange("working", "qualified", contact(), NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "qualified");
  assert.equal(rows[0].id, "c1_qualified");
  assert.equal(rows[0].contactId, "c1");
  assert.equal(rows[0].at, NOW.toISOString());
  // sourceLabel is the funnel's own display label — the join key the rollup and the
  // diagnosis grounding both group by.
  assert.equal(rows[0].sourceLabel, "Google Ads – Brand");
  assert.deepEqual(rows[0].attribution, { source: "google-ads", campaign: "Brand", gclid: "GCL123" });
  assert.equal(rows[0].value, null, "no value producer on the stage path ⇒ null, never 0");
});

test("NO PII on a row: no name, e-mail or phone survives the projection", () => {
  const [row] = conversionFromStageChange("new", "qualified", contact(), NOW);
  const json = JSON.stringify(row);
  assert.ok(!json.includes("Jan"), "name must not reach the ledger");
  assert.ok(!json.includes("jan@firma.cz"), "e-mail must not reach the ledger");
  assert.ok(!json.includes("777123456"), "phone must not reach the ledger");
  // …and the campaign-analytics fields an upload has no use for are dropped too.
  const wide = contact({ attribution: { source: "sklik", medium: "cpc", term: "boty", gclid: "G" } });
  const [w] = conversionFromStageChange("new", "qualified", wide, NOW);
  assert.deepEqual(Object.keys(w.attribution).sort(), ["gclid", "source"]);
});

test("qualified → won mints won only; a direct working → won mints BOTH", () => {
  const won = contact({ stage: "won" });
  assert.deepEqual(
    conversionFromStageChange("qualified", "won", won, NOW).map((e) => e.kind),
    ["won"]
  );
  assert.deepEqual(
    conversionFromStageChange("working", "won", won, NOW).map((e) => e.kind),
    ["qualified", "won"],
    "the funnel really did pass through qualification — both signals are owed"
  );
});

test("a rank REGRESSION is SILENT (a retraction is the live-upload WP's problem)", () => {
  assert.deepEqual(conversionFromStageChange("qualified", "working", contact({ stage: "working" }), NOW), []);
  assert.deepEqual(conversionFromStageChange("won", "lost", contact({ stage: "lost" }), NOW), []);
  assert.deepEqual(conversionFromStageChange("qualified", "disqualified", contact({ stage: "disqualified" }), NOW), []);
  // a no-op move and a below-rank-1 move mint nothing either
  assert.deepEqual(conversionFromStageChange("new", "new", contact({ stage: "new" }), NOW), []);
  assert.deepEqual(conversionFromStageChange("new", "working", contact({ stage: "working" }), NOW), []);
  // …and a step INSIDE the qualified band mints nothing new
  assert.deepEqual(conversionFromStageChange("qualified", "opportunity", contact({ stage: "opportunity" }), NOW), []);
});

test("the id is stable across a regress→re-qualify cycle (upsert, never a duplicate)", () => {
  const first = conversionFromStageChange("working", "qualified", contact(), NOW)[0];
  const later = new Date("2026-09-05T08:00:00.000Z");
  const second = conversionFromStageChange(
    "working",
    "qualified",
    contact({ stageEnteredAt: later.toISOString() }),
    later
  )[0];
  assert.equal(first.id, second.id);
  assert.equal(first.id, conversionEventId("c1", "qualified"));
  assert.notEqual(first.at, second.at, "the row moves to the NEW entry moment");
});

test("conversionFromApply covers the import path changeStage never sees", () => {
  const imported = contact({ stage: "won", stageEnteredAt: "2026-08-20T00:00:00.000Z" });
  const rows = conversionFromApply(imported, NOW, { value: 48000, connectorId: "csv" });
  assert.deepEqual(rows.map((e) => e.kind), ["qualified", "won"]);
  assert.equal(rows[1].value, 48000);
  assert.equal(rows[1].connectorId, "csv");
  assert.equal(rows[1].at, "2026-08-20T00:00:00.000Z", "the stage-ENTRY moment, not the ingest moment");
  // a contact that lands below rank 1 mints nothing
  assert.deepEqual(conversionFromApply(contact({ stage: "new" }), NOW), []);
});

test("value: null ≠ 0 — an empty, zero or negative cell is UNKNOWN", () => {
  assert.equal(conversionValue("48000"), 48000);
  assert.equal(conversionValue("1 200"), null, "a grouped number is not parseable as one value");
  assert.equal(conversionValue("990,50"), 990.5, "cs decimal comma");
  assert.equal(conversionValue(""), null);
  assert.equal(conversionValue(undefined), null);
  assert.equal(conversionValue("0"), null);
  assert.equal(conversionValue(-5), null);
  assert.equal(conversionValue("nope"), null);
});

test("gclidCoverage is honest about what can actually be uploaded", () => {
  const ev = (gclid) => ({ attribution: gclid ? { source: "s", gclid } : { source: "s" } });
  assert.deepEqual(gclidCoverage([]), { total: 0, withGclid: 0, pct: 0 });
  assert.deepEqual(gclidCoverage([ev("a"), ev("b"), ev(null)]), { total: 3, withGclid: 2, pct: 0.67 });
  assert.deepEqual(gclidCoverage([ev(null), ev(null)]), { total: 2, withGclid: 0, pct: 0 });
});

test("summarizeConversions: 30-day window, per-source split, coverage", () => {
  const row = (id, kind, at, label, gclid) => ({
    id,
    contactId: id,
    kind,
    at,
    sourceLabel: label,
    attribution: gclid ? { source: "x", gclid } : { source: "x" },
    value: null,
  });
  const summary = summarizeConversions(
    [
      row("a", "qualified", "2026-08-29T00:00:00.000Z", "Google Ads", "G1"),
      row("b", "won", "2026-08-20T00:00:00.000Z", "Google Ads", "G2"),
      row("c", "qualified", "2026-08-15T00:00:00.000Z", "Sklik", null),
      // outside the window — counted nowhere
      row("d", "won", "2026-06-01T00:00:00.000Z", "Google Ads", "G3"),
    ],
    NOW
  );
  assert.equal(summary.qualified30d, 2);
  assert.equal(summary.won30d, 1);
  assert.equal(summary.gclidPct, 0.67, "2 of the 3 in-window rows carry a click id");
  assert.equal(summary.updatedAt, NOW.toISOString());
  assert.deepEqual(summary.bySource, [
    { sourceLabel: "Google Ads", qualified30d: 1, won30d: 1, gclidPct: 1 },
    { sourceLabel: "Sklik", qualified30d: 1, won30d: 0, gclidPct: 0 },
  ]);
});

test("window + retention day maths, and the declared bounds", () => {
  assert.equal(windowStartDay(NOW, 30), "2026-07-31");
  assert.equal(retentionCutoffDay(NOW), "2026-03-03");
  assert.equal(CONVERSION_RETENTION_DAYS, 180);
  assert.equal(CONVERSION_EVENT_CAP, 5000);
  assert.equal(isConversionKind("won"), true);
  assert.equal(isConversionKind("lost"), false);
});
