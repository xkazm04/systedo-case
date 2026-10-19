/** The portfolio header must not fold a fixture project's numbers into a live
 *  project's ROAS. Rows that disagree about provenance sum the live rows only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { portfolioLead } = await import("@/components/app/overview/portfolio-lead");

const row = (live, revenue, cost) => ({ id: `${live}${revenue}`, live, totals: { revenue, cost } });

test("all live: sums every row", () => {
  const l = portfolioLead([row(true, 100, 20), row(true, 50, 30)]);
  assert.equal(l.basis, "live");
  assert.equal(l.counted, 2);
  assert.equal(l.roas, 3);
});

test("no live row: sums, but declares itself sample", () => {
  const l = portfolioLead([row(false, 100, 20), row(false, 50, 30)]);
  assert.equal(l.basis, "sample");
  assert.equal(l.n, 2);
  assert.equal(l.roas, 3);
});

test("mixed provenance: live rows only, never a blend", () => {
  // the old arithmetic summed all three rows: (100 + 900 + 900) / (50 + 100 + 100) = 7.6
  const l = portfolioLead([row(true, 100, 50), row(false, 900, 100), row(false, 900, 100)]);
  assert.equal(l.basis, "live-subset");
  assert.equal(l.counted, 1);
  assert.equal(l.n, 3);
  assert.equal(l.revenue, 100);
  assert.equal(l.roas, 2);
});

test("zero cost reads as zero ROAS, not NaN", () => {
  assert.equal(portfolioLead([row(true, 100, 0)]).roas, 0);
  assert.equal(portfolioLead([]).roas, 0);
});
