/** Each verdict clears the floor of its own denominator (technique
 *  minimum-sample-before-verdict): win rate and CPQL divide by qualified, so they wait
 *  for enough qualified leads, while the qualification verdict still runs on leads. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMetrics, sourceTrend, sourceAlerts, MIN_QUALIFIED_FOR_VERDICT } from "@/lib/lead-quality/compute";
import { pickCause, baseLeadSourceDiagnosis, buildLeadSourceDiagnosisPrompt } from "@/lib/ai/tools/lead-source-diagnosis";
import { toLeadSourceSeed, seedToRequest } from "@/lib/diagnoses/lead-source-request";

const src = (source, leads, qualified, won, spend, prior) => ({ source, leads, qualified, won, spend, revenue: 0, ...(prior ? { prior } : {}) });
const reqOf = (s, all = [s]) => {
  const rows = all.map(withMetrics);
  return seedToRequest(toLeadSourceSeed(withMetrics(s), rows));
};

test("a win rate over too few qualified leads is volume, not mis-targeting", () => {
  const req = reqOf(src("Telefon", 41, 22, 1, 0));
  assert.equal(pickCause(req), "volume");
  const d = baseLeadSourceDiagnosis(req);
  assert.equal(d.severity, "low");
  assert.match(d.summary, /kvalifikovaných leadů je zatím jen 22/);
  assert.match(buildLeadSourceDiagnosisPrompt(req), /Kvalifikovaných je méně než 30/);
});

test("at the qualified floor the same win rate is judged", () => {
  assert.equal(pickCause(reqOf(src("Doporučení", 52, MIN_QUALIFIED_FOR_VERDICT, 2, 0))), "mis-targeting");
});

test("the qualification verdict still runs on leads under the qualified floor", () => {
  assert.equal(pickCause(reqOf(src("LinkedIn", 44, 11, 0, 0))), "mis-targeting");
});

test("a CPQL rise needs both periods over the qualified floor", () => {
  const thin = src("Meta", 60, 24, 2, 21_000, { leads: 52, qualified: 22, won: 3, spend: 15_000 });
  assert.deepEqual(sourceAlerts(sourceTrend(thin)), []);
  const req = reqOf(thin);
  assert.equal(req.trend?.cpqlDelta ?? null, null);
  assert.doesNotMatch(baseLeadSourceDiagnosis(req).summary, /CPQL vzrostlo/);
  const priorThin = src("Porovnávač", 48, 31, 3, 30_000, { leads: 44, qualified: 29, won: 4, spend: 22_000 });
  assert.deepEqual(sourceAlerts(sourceTrend(priorThin)).map((a) => a.kind), ["cpql-target"]);
  const judged = src("Sklik", 90, 40, 6, 36_000, { leads: 80, qualified: 40, won: 6, spend: 24_000 });
  assert.deepEqual(sourceAlerts(sourceTrend(judged)).map((a) => a.kind), ["cpql-rise"]);
});
