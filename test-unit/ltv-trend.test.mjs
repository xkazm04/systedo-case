/** Unit tests for the cohort trend + CSV export helpers (feature #5). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMetrics, cohortTrend, buildCohortCsv, csvCell } from "@/lib/ltv/compute";

const base = { month: "Led", signups: 100, spend: 100_000, arpu: 300, retention: [1, 0.7, 0.5, 0.4] };

test("cohortTrend reports improving when newest LTV:CAC rises", () => {
  // newer cohort: cheaper acquisition (lower spend) → higher LTV:CAC
  const oldest = withMetrics(base);
  const newest = withMetrics({ ...base, month: "Úno", spend: 60_000 });
  const t = cohortTrend([oldest, newest]);
  assert.ok(t);
  assert.equal(t.direction, "improving");
  assert.equal(t.fromMonth, "Led");
  assert.equal(t.toMonth, "Úno");
  assert.ok(t.ltvCacDelta > 0); // ratio went up
  assert.ok(t.cacDelta < 0); // CAC fell (60000/100 < 100000/100)
  assert.ok(t.ltvCacDeltaPct > 0);
});

test("cohortTrend reports worsening when newest LTV:CAC falls", () => {
  const oldest = withMetrics(base);
  const newest = withMetrics({ ...base, month: "Úno", spend: 160_000 }); // pricier → lower ratio
  const t = cohortTrend([oldest, newest]);
  assert.ok(t);
  assert.equal(t.direction, "worsening");
  assert.ok(t.ltvCacDelta < 0);
});

test("cohortTrend is flat when ratio is unchanged", () => {
  const a = withMetrics(base);
  const b = withMetrics({ ...base, month: "Úno" }); // identical economics
  const t = cohortTrend([a, b]);
  assert.ok(t);
  assert.equal(t.direction, "flat");
  assert.equal(t.ltvCacDelta, 0);
});

test("cohortTrend returns null with fewer than two cohorts", () => {
  assert.equal(cohortTrend([]), null);
  assert.equal(cohortTrend([withMetrics(base)]), null);
});

test("csvCell escapes quotes, commas and newlines per RFC-4180", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell(42), "42");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('he said "hi"'), '"he said ""hi"""');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
});

test("buildCohortCsv emits a header + one row per cohort with escaped fields", () => {
  const tricky = withMetrics({ ...base, month: 'Q1, "peak"' });
  const csv = buildCohortCsv([tricky]);
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 2); // header + 1 row
  assert.ok(lines[0].startsWith("Kohorta,Registrace,CAC"));
  // the comma+quote month is wrapped and its quotes doubled
  assert.ok(lines[1].startsWith('"Q1, ""peak""",100,1000,'));
});
