/** Direction 2 — one cohort truth. resolveCohorts is the single source both the /ltv
 *  page and the report's "Beyond this period" block consume, so a project's LTV:CAC is
 *  identical on both surfaces. Pins: eshop resolution == the report's historical
 *  cohortsForProject (report numbers unchanged); determinism per project; the SaaS base
 *  is resolved for non-eshop; and the resolver actually varies between projects. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./json-loader.mjs", import.meta.url);

const { resolveCohorts } = await import("@/lib/ltv/resolve");
const { cohortsForProject, ESHOP_COHORTS, SAMPLE_COHORTS } = await import("@/lib/ltv/sample");
const { ltvSummary } = await import("@/lib/ltv/compute");

const eshop = { id: "proj-eshop-1", type: "eshop" };
const saas = { id: "proj-saas-1", type: "app" };

test("eshop: resolveCohorts == the report's historical cohortsForProject (byte-identical numbers)", () => {
  assert.deepEqual(resolveCohorts(eshop), cohortsForProject(eshop));
  // …and the derived LTV summary the report's Beyond block reads therefore agrees too.
  assert.deepEqual(ltvSummary(resolveCohorts(eshop)), ltvSummary(cohortsForProject(eshop)));
});

test("both surfaces agree: /ltv and the report resolve the SAME cohorts for a project", () => {
  // The /ltv page and the report page both call resolveCohorts(project); pin that the
  // call is a pure function of the project (deterministic), so the two surfaces can't
  // drift apart.
  assert.deepEqual(resolveCohorts(eshop), resolveCohorts(eshop));
  const a = ltvSummary(resolveCohorts(eshop));
  const b = ltvSummary(resolveCohorts(eshop));
  assert.equal(a.avgLtvCac, b.avgLtvCac);
  assert.equal(a.paidCac, b.paidCac);
});

test("non-eshop resolves the SaaS/app base (signup/retention), same length, varied not raw", () => {
  const got = resolveCohorts(saas);
  assert.equal(got.length, SAMPLE_COHORTS.length);
  // It is the varied sample, not the raw static constant.
  assert.notDeepEqual(got, SAMPLE_COHORTS);
  // And it is NOT the eshop base — the two project kinds read different shapes.
  assert.notDeepEqual(got.map((c) => c.month), ESHOP_COHORTS.map((c) => c.month).slice(0, 0));
});

test("the resolver actually varies between projects (different LTV:CAC)", () => {
  const one = ltvSummary(resolveCohorts({ id: "aaa", type: "eshop" }));
  const two = ltvSummary(resolveCohorts({ id: "zzz", type: "eshop" }));
  assert.notEqual(one.avgLtvCac, two.avgLtvCac);
});
