/** The Overview's "N poptávek po SLA" critical is computed from the hardcoded
 *  SAMPLE_LEADS (no lead intake exists yet), so for a real tenant it would be a
 *  permanent, tenant-independent false alarm. It must carry the `sample`
 *  provenance flag so the Overview renders its "Ukázková data" chip — tagged,
 *  never suppressed, exactly per the Recommendation.sample contract. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { collectRecommendations } = await import("@/lib/insights/aggregate");
const { SAMPLE_LEADS } = await import("@/lib/speed-lead/sample");
const { SLA_TARGET_MIN } = await import("@/lib/speed-lead/draft");

const leadgenProject = (id) => ({
  id,
  name: `Leadgen ${id}`,
  type: "leadgen",
  domain: `${id}.example.com`,
  accentColor: "#14b8b1",
});

test("the schranka SLA critical is sample-tagged (it reads the hardcoded SAMPLE_LEADS)", () => {
  // Guard the premise: the fixture actually contains overdue leads, so the rec fires.
  const overdue = SAMPLE_LEADS.filter((l) => l.minutesAgo > SLA_TARGET_MIN).length;
  assert.ok(overdue > 0, "fixture premise: SAMPLE_LEADS contains overdue leads");

  const recs = collectRecommendations(leadgenProject("proj-sla"), "cs");
  const sla = recs.find((r) => r.module === "schranka");
  assert.ok(sla, "the SLA rec fires for a leadgen project");
  assert.equal(sla.severity, "critical");
  assert.equal(sla.sample, true, "provenance disclosed: derived from sample leads");
});
