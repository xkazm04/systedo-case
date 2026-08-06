/** Locale-parameterised formatting (format-helpers #2): the bilingual text
 *  builders and the metric registry must format numbers in the ACTIVE locale,
 *  not the hard-pinned Czech default. Runs the TS source directly via the shared
 *  resolve hook (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFormatters, SUPPORTED_LOCALES, LOCALES, DEFAULT_LOCALE } from "@/lib/format";
import { METRICS } from "@/lib/metrics/meta";

test("SUPPORTED_LOCALES is the one source the locale universe derives from", () => {
  // LOCALES config + the default must cover exactly the declared locale set, so a
  // new market added to SUPPORTED_LOCALES surfaces as a missing-config type/test error.
  assert.deepEqual([...SUPPORTED_LOCALES].sort(), Object.keys(LOCALES).sort());
  assert.ok(SUPPORTED_LOCALES.includes(DEFAULT_LOCALE));
});

const cs = createFormatters("cs");
const en = createFormatters("en");

test("en formatters use en-US number shapes but keep CZK: the data is koruna", () => {
  // The `en` locale changes the LANGUAGE, not the money. Every stored amount is
  // CZK (lib/campaigns/currency.ts: BASE_CURRENCY, "we relabel, never rescale"),
  // so labelling it "$" told an English reader a figure ~22× its real value.
  const money = en.fmtCZK(1_234_567);
  assert.ok(!money.includes("$"), `en money must not claim dollars: "${money}"`);
  assert.ok(/CZK|Kč/.test(money), `en money must name the real currency: "${money}"`);
  assert.ok(en.fmtPct(0.165).includes("16.5"), `en percent uses a period decimal`);
  assert.ok(en.fmtMultiple(5.6).includes("5.6"), `en multiple uses a period decimal`);
});

test("cs formatters keep the comma-decimal Czech rendering", () => {
  assert.ok(cs.fmtCZK(1_234_567).includes("Kč"));
  assert.ok(cs.fmtPct(0.165).includes("16,5"));
  assert.ok(cs.fmtMultiple(5.6).includes("5,6"));
});

test("metric registry: format(v) without a Formatters stays byte-identical Czech", () => {
  assert.equal(METRICS.revenue.format(1500), cs.fmtCZK(1500));
  assert.equal(METRICS.pno.format(0.85), cs.fmtPct(0.85));
  assert.equal(METRICS.roas.format(4.2), cs.fmtMultiple(4.2));
  assert.equal(METRICS.visits.formatCompact(12_400), cs.fmtInt(12_400));
});

test("signed currency: plus for gains, true minus for losses, rounds before signing", () => {
  assert.ok(cs.fmtSignedCZK(38_000).startsWith("+"));
  // U+2212 true minus, never the ASCII hyphen Intl emits for negatives
  assert.ok(cs.fmtSignedCZK(-85_000).startsWith("−"));
  assert.ok(!cs.fmtSignedCZK(-85_000).includes("-"));
  // a sub-koruna delta displays as zero → no misleading sign
  assert.equal(cs.fmtSignedCZK(0.4), cs.fmtCZK(0));
  assert.ok(cs.fmtSignedCZKCompact(1_600_000).startsWith("+"));
  assert.ok(cs.fmtSignedCZKCompact(-1_600_000).startsWith("−"));
  assert.equal(cs.fmtSignedCZK(Number.NaN), "—");
});

test("date/time surface: fmtDuration, fmtTime, fmtWeekdayShort follow the locale", () => {
  // durations: whole seconds under a minute, one locale decimal above it
  assert.equal(cs.fmtDuration(42), "42 s");
  assert.equal(cs.fmtDuration(210), "3,5 min");
  assert.equal(en.fmtDuration(210), "3.5 min");
  assert.equal(cs.fmtDuration(180), "3 min"); // no forced ",0"
  assert.equal(cs.fmtDuration(Number.NaN), "—");
  // clock time of a full ISO timestamp
  assert.ok(cs.fmtTime("2026-06-15T14:05:00").includes("14:05"));
  assert.equal(cs.fmtTime("not-a-date"), "—");
  // short weekday label for a date-only string (2026-07-06 is a Monday)
  const csDay = cs.fmtWeekdayShort("2026-07-06");
  const enDay = en.fmtWeekdayShort("2026-07-06");
  assert.ok(csDay.toLowerCase().includes("po"), `cs weekday: ${csDay}`);
  assert.ok(enDay.includes("Mon"), `en weekday: ${enDay}`);
  assert.equal(cs.fmtWeekdayShort("nope"), "—");
});

test("metric registry: format(v, enFormatters) renders the en locale", () => {
  assert.equal(METRICS.revenue.format(1500, en), en.fmtCZK(1500));
  // en switches the language, not the currency — the stored amount is koruna.
  assert.ok(/CZK|Kč/.test(METRICS.revenue.format(1500, en)));
  assert.equal(METRICS.pno.format(0.85, en), en.fmtPct(0.85));
  assert.equal(METRICS.cost.formatCompact(1_600_000, en), en.fmtCZKCompact(1_600_000));
});
