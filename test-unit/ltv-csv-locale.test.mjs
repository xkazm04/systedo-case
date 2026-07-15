/** Direction 3 — the cohort CSV header is locale-aware; the cs export stays
 *  byte-identical to the original hardcoded header, en gets English column names.
 *  The number cells stay cs-formatted regardless of locale (only the header row is
 *  localized), so a cs sheet still parses the values. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./json-loader.mjs", import.meta.url);

const { buildCohortCsv, withMetrics } = await import("@/lib/ltv/compute");

const rows = [withMetrics({ month: "Led 2026", signups: 100, spend: 100_000, arpu: 300, retention: [1, 0.7, 0.5, 0.4] })];

test("cs (default) header is byte-identical to the original hardcoded header", () => {
  const csv = buildCohortCsv(rows);
  const header = csv.split("\r\n")[0];
  assert.equal(header, "Kohorta,Registrace,CAC,M3 retence,LTV,LTV:CAC,Návratnost (měs.)");
  // Explicit cs arg matches the default.
  assert.equal(buildCohortCsv(rows, "cs"), csv);
});

test("en header uses English column names; the data rows are unchanged", () => {
  const cs = buildCohortCsv(rows, "cs");
  const en = buildCohortCsv(rows, "en");
  const enHeader = en.split("\r\n")[0];
  assert.equal(enHeader, "Cohort,Sign-ups,CAC,M3 retention,LTV,LTV:CAC,Payback (mo.)");
  // Only the header row differs — the value rows are byte-identical across locales.
  assert.deepEqual(en.split("\r\n").slice(1), cs.split("\r\n").slice(1));
});

test("unknown locale falls back to the cs header (no crash)", () => {
  assert.equal(buildCohortCsv(rows, "de").split("\r\n")[0], buildCohortCsv(rows, "cs").split("\r\n")[0]);
});
