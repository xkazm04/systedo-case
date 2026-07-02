/** Locale-parameterised formatting (format-helpers #2): the bilingual text
 *  builders and the metric registry must format numbers in the ACTIVE locale,
 *  not the hard-pinned Czech default. Runs the TS source directly via the shared
 *  resolve hook (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFormatters } from "@/lib/format";
import { METRICS } from "@/lib/metrics/meta";

const cs = createFormatters("cs");
const en = createFormatters("en");

test("en formatters speak en-US/USD: dollar currency, period decimals", () => {
  const money = en.fmtCZK(1_234_567);
  assert.ok(money.includes("$"), `expected a $ amount, got "${money}"`);
  assert.ok(!money.includes("Kč"), `en money must not carry Kč: "${money}"`);
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

test("metric registry: format(v, enFormatters) renders the en locale", () => {
  assert.equal(METRICS.revenue.format(1500, en), en.fmtCZK(1500));
  assert.ok(METRICS.revenue.format(1500, en).includes("$"));
  assert.equal(METRICS.pno.format(0.85, en), en.fmtPct(0.85));
  assert.equal(METRICS.cost.formatCompact(1_600_000, en), en.fmtCZKCompact(1_600_000));
});
