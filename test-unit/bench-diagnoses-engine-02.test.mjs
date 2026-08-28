/** Bench regression (diagnoses-engine-02): the persisted outcome snapshot's key is
 *  never tied to the diagnosis kind. sanitizeDiagnosisInput only checks the key is
 *  one of {ltvCac,qualRate,coverage} — a client can POST a cohort diagnosis with
 *  snapshot {key:"coverage", metric:0.001}, a nonsense differently-scaled baseline
 *  that makes the render-time outcome chip claim "improved"/"worse" arbitrarily.
 *  Correct behaviour: enforce the kind→key map (cohort→ltvCac, lead-source→qualRate,
 *  local→coverage) and DROP a mismatched snapshot (like other malformed snapshots —
 *  the record simply has no outcome chip). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeDiagnosisInput } from "@/lib/diagnoses/types";

const wire = (kind, snapshot) => ({
  kind,
  result:
    kind === "cohort"
      ? { summary: "s", worstCohort: "2025-01", recommendation: "r" }
      : kind === "lead-source"
        ? { summary: "s", likelyCause: "spam", recommendation: "r" }
        : { summary: "s", worstGap: "hours", recommendation: "r" },
  snapshot,
});

test("a snapshot whose key does not match the kind is dropped", () => {
  const cohortWithCoverage = sanitizeDiagnosisInput(wire("cohort", { key: "coverage", metric: 0.001 }));
  assert.ok(cohortWithCoverage, "the diagnosis itself still sanitizes");
  assert.equal(
    cohortWithCoverage.snapshot,
    undefined,
    'a cohort diagnosis must not carry a "coverage" baseline (kind→key: cohort→ltvCac) — it forges the outcome chip'
  );

  const leadWithLtvCac = sanitizeDiagnosisInput(wire("lead-source", { key: "ltvCac", metric: 2 }));
  assert.ok(leadWithLtvCac);
  assert.equal(
    leadWithLtvCac.snapshot,
    undefined,
    'a lead-source diagnosis must not carry an "ltvCac" baseline (kind→key: lead-source→qualRate)'
  );
});

test("a snapshot whose key matches the kind is kept (no regression)", () => {
  assert.deepEqual(
    sanitizeDiagnosisInput(wire("cohort", { key: "ltvCac", metric: 1.5 })).snapshot,
    { key: "ltvCac", metric: 1.5 }
  );
  assert.deepEqual(
    sanitizeDiagnosisInput(wire("lead-source", { key: "qualRate", metric: 0.4 })).snapshot,
    { key: "qualRate", metric: 0.4 }
  );
  assert.deepEqual(
    sanitizeDiagnosisInput(wire("local", { key: "coverage", metric: 0.6 })).snapshot,
    { key: "coverage", metric: 0.6 }
  );
});
