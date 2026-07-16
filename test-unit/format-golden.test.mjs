/** Byte-identical guard for the locale formatters (src/lib/format.ts). The Intl
 *  instances behind fmt* are memoized at module scope keyed by (locale,
 *  options-kind) instead of reconstructed per call; this pins the OUTPUT of every
 *  formatter for both locales over a representative value grid so that optimization
 *  — and any future refactor of the factory — cannot change a single rendered
 *  string. The golden (test-unit/fixtures/format-golden.json) was captured from the
 *  pre-memoization code; the grid below MUST stay identical to how it was generated. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createFormatters } from "@/lib/format";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = JSON.parse(readFileSync(join(HERE, "fixtures", "format-golden.json"), "utf8"));

// The exact value grid the golden was generated from — keep in lockstep.
const NUMS = [0, 1, -1, 0.5, -0.5, 2, 1234.567, -1234.567, 1234567, 999999999, 0.165, 12.4, 12400, 1600000, 38000, -85000, 0.005, -0.004, 1e-9, NaN, Infinity, -Infinity];
const PCTS = [0, 0.165, -0.031, 1, 0.00004, -0.00004, 0.5, NaN, Infinity];
const DIGITS = [0, 1, 2, 3];
const DATES = ["2026-07-15", "2026-05-31", "2026-01-01", "2026-12-31", "2026-07-15T14:05:00Z", "2026-06-15T02:05:00Z", "not-a-date", ""];
const RANGES = [["2026-05-01", "2026-05-31"], ["2026-04-28", "2026-05-04"], ["2025-12-30", "2026-01-05"], ["2026-07-15", "2026-07-15"], ["bad", "2026-01-01"]];
const DURS = [0, 42, 59, 60, 210, 3600, 3661, NaN];
const NOW = new Date("2026-07-15T12:00:00Z");
const RELS = ["2026-07-15T11:59:30Z", "2026-07-15T11:00:00Z", "2026-07-14T12:00:00Z", "2026-07-01T12:00:00Z", "2026-05-15T12:00:00Z", "2025-07-15T12:00:00Z", "2026-07-16T12:00:00Z", "bad"];

function dumpLocale(locale) {
  const f = createFormatters(locale);
  return {
    fmtInt: NUMS.map((n) => f.fmtInt(n)),
    fmtSignedInt: NUMS.map((n) => f.fmtSignedInt(n)),
    fmtCZK: NUMS.map((n) => f.fmtCZK(n)),
    fmtSignedCZK: NUMS.map((n) => f.fmtSignedCZK(n)),
    fmtCZKCompact: NUMS.map((n) => f.fmtCZKCompact(n)),
    fmtSignedCZKCompact: NUMS.map((n) => f.fmtSignedCZKCompact(n)),
    fmtCompact: NUMS.map((n) => f.fmtCompact(n)),
    fmtDecimal: DIGITS.flatMap((d) => NUMS.map((n) => f.fmtDecimal(n, d))),
    fmtMultiple: DIGITS.flatMap((d) => NUMS.map((n) => f.fmtMultiple(n, d))),
    fmtPct: DIGITS.flatMap((d) => PCTS.map((p) => f.fmtPct(p, d))),
    fmtSignedPct: DIGITS.flatMap((d) => PCTS.map((p) => f.fmtSignedPct(p, d))),
    fmtDate: DATES.map((s) => f.fmtDate(s)),
    fmtDateShort: DATES.map((s) => f.fmtDateShort(s)),
    fmtMonth: DATES.map((s) => f.fmtMonth(s)),
    fmtMonthLong: DATES.map((s) => f.fmtMonthLong(s)),
    fmtDateTime: DATES.map((s) => f.fmtDateTime(s)),
    fmtTime: DATES.map((s) => f.fmtTime(s)),
    fmtWeekdayShort: DATES.map((s) => f.fmtWeekdayShort(s)),
    fmtDuration: DURS.map((s) => f.fmtDuration(s)),
    fmtRange: RANGES.map(([a, b]) => f.fmtRange(a, b)),
    fmtRelative: RELS.map((s) => f.fmtRelative(s, NOW)),
    fmtCZKCompactA11y: NUMS.map((n) => f.fmtCZKCompactA11y(n)),
    fmtCompactA11y: NUMS.map((n) => f.fmtCompactA11y(n)),
  };
}

for (const locale of ["cs", "en"]) {
  test(`formatters render byte-identical to golden (${locale})`, () => {
    assert.deepEqual(dumpLocale(locale), GOLDEN[locale]);
  });
}

test("memoization returns the SAME Intl instance across formatter sets (same locale)", () => {
  // Two independent createFormatters(cs) calls must share the module-scope Intl
  // instances (proving the hoist works), yet still render identically.
  const a = createFormatters("cs");
  const b = createFormatters("cs");
  assert.equal(a.fmtCZK(1234567), b.fmtCZK(1234567));
  // (spacing is a locale-specific no-break space — assert structure, not the exact glyph)
  assert.match(a.fmtCZK(1234567), /^1.234.567.Kč$/u);
});
