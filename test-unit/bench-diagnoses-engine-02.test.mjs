/** Bench regression (diagnoses-engine-02): the persisted outcome snapshot's key is
 *  never tied to the diagnosis kind. sanitizeDiagnosisInput only checks the key is
 *  one of {ltvCac,qualRate,coverage,pno} — a client can POST a cohort diagnosis with
 *  snapshot {key:"coverage", metric:0.001}, a nonsense differently-scaled baseline
 *  that makes the render-time outcome chip claim "improved"/"worse" arbitrarily.
 *  Correct behaviour: enforce the kind→key map (cohort→ltvCac, lead-source→qualRate,
 *  local→coverage, ads→pno) and DROP a mismatched snapshot (like other malformed
 *  snapshots — the record simply has no outcome chip). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeDiagnosisInput } from "@/lib/diagnoses/types";

const RESULTS = {
  cohort: { summary: "s", worstCohort: "2025-01", recommendation: "r" },
  "lead-source": { summary: "s", likelyCause: "spam", recommendation: "r" },
  local: { summary: "s", worstGap: "hours", recommendation: "r" },
  ads: { summary: "s", likelyCause: "waste-zero-conv", recommendation: "r" },
};

const wire = (kind, snapshot) => ({ kind, result: RESULTS[kind], snapshot });

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

// WP W1-D: the fourth kind rides the same map — "ads" snapshots portfolio PNO, and
// nothing else. A qualRate baseline on an ads diagnosis is the same forgery.
test("the ads kind is pinned to pno, and only pno", () => {
  assert.deepEqual(
    sanitizeDiagnosisInput(wire("ads", { key: "pno", metric: 0.25 })).snapshot,
    { key: "pno", metric: 0.25 }
  );
  assert.equal(
    sanitizeDiagnosisInput(wire("ads", { key: "qualRate", metric: 0.9 })).snapshot,
    undefined,
    'an ads diagnosis must not carry a "qualRate" baseline (kind→key: ads→pno)'
  );
  assert.equal(
    sanitizeDiagnosisInput(wire("local", { key: "pno", metric: 0.25 })).snapshot,
    undefined,
    "and no other kind may borrow the pno baseline"
  );
});
