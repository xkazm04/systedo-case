/** Pins that the rows `/cena` renders are DERIVED from the pricing module rather
 *  than typed beside it.
 *
 *  Why this test and not a rendering test: the failure it guards against is not a
 *  broken page, it is a page that renders perfectly while quoting a price the
 *  billing seam no longer charges or a daily limit the metering no longer
 *  enforces. That drift is invisible to typecheck, to lint and to an e2e smoke —
 *  a stale number is still a string. It is only catchable by asserting the
 *  relationship: the row set IS `PLAN_INFO`, and every number inside a feature
 *  line arrives through a placeholder filled from that plan's own `PLANS` entry.
 *
 *  `/cena` used to carry its own `PLAN_COPY` while `PLAN_INFO` carried a second,
 *  cs-only `tagline`/`features` pair that had already drifted from it. One of the
 *  two is gone; this test is what keeps the survivor honest. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANS, PLAN_INFO, planPriceCzk } from "@/lib/plans";
import { SUPPORTED_LOCALES } from "@/lib/format";
import { PLAN_COPY, planRows } from "@/components/marketing/pricing/planRows";

/** The identity formatter: the page injects a localized `fmtInt`, but a test
 *  about DERIVATION must not also depend on Intl's grouping separators. */
const raw = (n) => String(n);

test("the row set is PLAN_INFO — same plans, same order", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const rows = planRows(locale, raw);
    assert.deepEqual(
      rows.map((r) => r.id),
      PLAN_INFO.map((p) => p.id),
      `${locale}: the pricing table must not add, drop or reorder a plan`
    );
  }
});

test("name, price and the featured card come from the catalogue", () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const row of planRows(locale, raw)) {
      const plan = PLAN_INFO.find((p) => p.id === row.id);
      assert.equal(row.name, plan.name);
      assert.equal(row.priceCzk, plan.priceCzk);
      // planPriceCzk is what the ACCOUNT page quotes — the two surfaces cannot
      // state different prices for the same plan.
      assert.equal(row.priceCzk, planPriceCzk(row.id));
      assert.equal(row.featured, plan.featured === true);
    }
  }
});

test("exactly one plan is featured, and exactly one is free", () => {
  const rows = planRows("cs", raw);
  assert.equal(rows.filter((r) => r.featured).length, 1);
  // The free card is the only actionable CTA on the page, and PricingPlans picks
  // it by price rather than by id — so "exactly one plan costs nothing" is a
  // load-bearing property of the catalogue, not a coincidence.
  assert.equal(rows.filter((r) => r.priceCzk === 0).length, 1);
});

test("every plan has copy in every locale, and no copy for a plan that does not exist", () => {
  const ids = PLAN_INFO.map((p) => p.id).sort();
  for (const locale of SUPPORTED_LOCALES) {
    assert.deepEqual(Object.keys(PLAN_COPY[locale]).sort(), ids, `${locale}: copy keys`);
    for (const id of ids) {
      assert.ok(PLAN_COPY[locale][id].tagline.length > 0, `${locale}/${id}: tagline`);
      assert.ok(PLAN_COPY[locale][id].features.length > 0, `${locale}/${id}: features`);
    }
  }
  // Every metered plan is priced. A plan in PLANS with no PLAN_INFO row would be
  // enforced by the metering and invisible on the pricing page.
  assert.deepEqual(Object.keys(PLANS).sort(), ids);
});

test("no daily limit and no price is TYPED into the copy — they arrive as placeholders", () => {
  const forbidden = new Set();
  for (const plan of PLAN_INFO) {
    if (plan.priceCzk > 0) forbidden.add(String(plan.priceCzk));
    for (const v of Object.values(PLANS[plan.id])) forbidden.add(String(v));
  }
  for (const locale of SUPPORTED_LOCALES) {
    for (const id of Object.keys(PLAN_COPY[locale])) {
      for (const line of [
        PLAN_COPY[locale][id].tagline,
        ...PLAN_COPY[locale][id].features,
      ]) {
        for (const n of forbidden) {
          assert.ok(
            !new RegExp(`(?<!\\{)\\b${n}\\b`).test(line),
            `${locale}/${id}: "${line}" states ${n} literally — interpolate {aiEval}/{sync}/{image} instead`
          );
        }
      }
    }
  }
});

test("the rendered rows actually carry that plan's own limits, fully interpolated", () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const row of planRows(locale, raw)) {
      const joined = row.features.join(" | ");
      assert.ok(
        !/[{}]/.test(joined) && !/[{}]/.test(row.tagline),
        `${locale}/${row.id}: an unfilled placeholder survived into the page: ${joined}`
      );
      // Whichever limits this plan's copy chose to quote, they must be ITS
      // limits. Assert per-placeholder rather than requiring all three, because
      // which limits a tier advertises is a copy decision — where the number
      // comes from is not.
      const source = PLAN_COPY[locale][row.id];
      for (const [key, value] of Object.entries(PLANS[row.id])) {
        if (!source.features.some((f) => f.includes(`{${key}}`))) continue;
        assert.ok(
          joined.includes(String(value)),
          `${locale}/${row.id}: quotes {${key}} but the rendered row does not carry ${value}`
        );
      }
    }
  }
});
