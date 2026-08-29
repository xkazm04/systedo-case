/** WP W2-B — the /sken funnel reader.
 *
 *  Two steps, never collapsed into one number: scans ÷ page views (a PAGE problem
 *  when it is low) and claims ÷ scans (a RESULT problem). Both inherit
 *  `funnelRollup`'s refusal to invent a rate on a thin window, which is the property
 *  worth pinning: a freshly-shipped page must report counts and "insufficient", not
 *  a confident 0 % or 100 %. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./json-loader.mjs", import.meta.url);

const { skenFunnelRollup, METRIC_SKEN_VIEW, METRIC_SKEN_SCAN, METRIC_SKEN_CLAIM } = await import(
  "@/lib/analytics/funnel"
);

const now = new Date("2026-08-29T12:00:00.000Z");
const row = (metric, day, count) => ({ metric, day, count });

test("metric names are the stable wire keys the emitters bump", () => {
  assert.equal(METRIC_SKEN_VIEW, "view:/sken");
  assert.equal(METRIC_SKEN_SCAN, "sken-scan");
  assert.equal(METRIC_SKEN_CLAIM, "sken-claim");
});

test("both steps compute exactly over the window", () => {
  const rows = [
    row(METRIC_SKEN_VIEW, "2026-08-28", 60),
    row(METRIC_SKEN_VIEW, "2026-08-29", 40),
    row(METRIC_SKEN_SCAN, "2026-08-28", 15),
    row(METRIC_SKEN_SCAN, "2026-08-29", 5),
    row(METRIC_SKEN_CLAIM, "2026-08-29", 5),
    // Noise the reader must ignore: another metric, and a day outside the window.
    row("signup", "2026-08-29", 999),
    row(METRIC_SKEN_VIEW, "2026-01-01", 5000),
  ];

  const { scan, claim } = skenFunnelRollup(rows, { now, windowDays: 30 });

  assert.equal(scan.denominator, 100, "views inside the window only");
  assert.equal(scan.numerator, 20);
  assert.equal(scan.rate, 0.2, "20 scans per 100 views");
  assert.equal(scan.status, "ok");

  assert.equal(claim.denominator, 20, "the claim step's denominator IS the scan count");
  assert.equal(claim.numerator, 5);
  assert.equal(claim.rate, 0.25, "5 claims per 20 scans");
  assert.equal(claim.status, "ok");
});

test("a thin window reports counts and withholds the rate — never a confident 0 %", () => {
  const { scan, claim } = skenFunnelRollup(
    [row(METRIC_SKEN_VIEW, "2026-08-29", 2), row(METRIC_SKEN_SCAN, "2026-08-29", 1)],
    { now }
  );
  assert.equal(scan.status, "insufficient");
  assert.equal(scan.rate, null, "two views and one scan is not a 50 % conversion");
  assert.equal(scan.denominator, 2, "the counts are still reported");
  assert.equal(claim.status, "insufficient", "one scan cannot produce a claim rate either");
});

test("no events at all is 'no-data', not zero", () => {
  const { scan, claim } = skenFunnelRollup([], { now });
  assert.equal(scan.status, "no-data");
  assert.equal(scan.rate, null);
  assert.equal(claim.status, "no-data");
});
