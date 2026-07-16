/** The Overview command center's LTV recommendation for an `app` project must read the
 *  project's RESOLVED cohorts (resolveCohorts — the same source the /ltv page consumes),
 *  not the global static SAMPLE_COHORTS. Otherwise Overview's "LTV:CAC pod cílem" can
 *  contradict the /ltv page it links to, and every app project shows the identical rec.
 *  Pure — no store, no clock. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { collectRecommendations } = await import("@/lib/insights/aggregate");
const { resolveCohorts } = await import("@/lib/ltv/resolve");
const { ltvSummary } = await import("@/lib/ltv/compute");
const { createFormatters } = await import("@/lib/format");

const appProject = (id) => ({
  id,
  name: `App ${id}`,
  type: "app",
  domain: `${id}.example.com`,
  accentColor: "#14b8b1",
});

test("app LTV rec reads the project's resolved cohorts (matches the /ltv page numbers)", () => {
  const project = appProject("proj-app-ltv");
  const f = createFormatters("cs");
  const expected = ltvSummary(resolveCohorts(project)); // exactly what /ltv computes

  const recs = collectRecommendations(project, "cs");
  const ltvRec = recs.find((r) => r.module === "ltv");

  if (expected.avgLtvCac < 3) {
    assert.ok(ltvRec, "an LTV rec fires when the resolved ratio is below target");
    assert.equal(ltvRec.metric, f.fmtMultiple(expected.avgLtvCac), "rec ratio == the /ltv ratio");
  } else {
    assert.equal(ltvRec, undefined, "no LTV rec when the resolved ratio meets target");
  }
});

test("app LTV rec is project-varied, not a global constant", () => {
  // Two different app projects resolve to different cohorts, so their LTV signals can
  // differ — the whole point of threading resolveCohorts instead of SAMPLE_COHORTS.
  const a = ltvSummary(resolveCohorts(appProject("proj-app-a")));
  const b = ltvSummary(resolveCohorts(appProject("proj-app-b")));
  assert.notEqual(a.avgLtvCac, b.avgLtvCac, "per-project variation reaches the LTV:CAC ratio");
});
