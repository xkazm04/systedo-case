/** Direction 1 — the loop actually closes (src/lib/diagnoses/outcome.ts):
 *   - snapshot extraction from the SERVER-rebuilt request, per kind
 *   - outcome comparison (improved / unchanged / worse) with the ±5 % dead-band
 *   - the "already resolved, unchanged" guard
 *   - the store sanitizer accepts/rejects a wire snapshot + it survives build/round-trip
 *  Pure — no model calls, no store I/O. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const {
  extractCohortSnapshot,
  extractLeadSourceSnapshot,
  extractLocalSnapshot,
  compareOutcome,
  alreadyResolvedUnchanged,
  OUTCOME_THRESHOLD,
} = await import("@/lib/diagnoses/outcome");
const { sanitizeDiagnosisInput, sanitizeDiagnosisSnapshot, buildStoredDiagnosis } = await import(
  "@/lib/diagnoses/types"
);

let seq = 0;
const idOf = () => `id-${++seq}`;

// --- snapshot extraction --------------------------------------------------

test("extractCohortSnapshot picks the WORST cohort's LTV:CAC (lowest)", () => {
  const req = {
    cohorts: [
      { month: "2025-01", ltvCac: 4.5, cac: 1, ltv: 1 },
      { month: "2025-02", ltvCac: 1.0, cac: 1, ltv: 1 },
      { month: "2025-03", ltvCac: 2.4, cac: 1, ltv: 1 },
    ],
  };
  assert.deepEqual(extractCohortSnapshot(req), { key: "ltvCac", metric: 1.0 });
  assert.equal(extractCohortSnapshot({ cohorts: [] }), null, "no cohorts → no snapshot");
});

test("extractLeadSourceSnapshot captures the source qualRate; extractLocalSnapshot the coverage", () => {
  assert.deepEqual(extractLeadSourceSnapshot({ source: "Meta", qualRate: 0.2 }), {
    key: "qualRate",
    metric: 0.2,
  });
  assert.deepEqual(extractLocalSnapshot({ coveragePct: 0.55 }), { key: "coverage", metric: 0.55 });
});

// --- outcome comparison ---------------------------------------------------

test("compareOutcome classifies improved / unchanged / worse against a ±5 % band", () => {
  const snap = { key: "qualRate", metric: 0.2 };
  // +10 % → improved
  assert.equal(compareOutcome(snap, 0.22).status, "improved");
  // −10 % → worse
  assert.equal(compareOutcome(snap, 0.18).status, "worse");
  // +2 % → within band → unchanged
  assert.equal(compareOutcome(snap, 0.204).status, "unchanged");
  // exactly on the threshold counts as improved (>=)
  assert.equal(compareOutcome({ key: "qualRate", metric: 1 }, 1 + OUTCOME_THRESHOLD).status, "improved");
});

test("compareOutcome reports the signed relative delta", () => {
  const v = compareOutcome({ key: "ltvCac", metric: 2 }, 3);
  assert.equal(v.status, "improved");
  assert.ok(Math.abs(v.deltaPct - 0.5) < 1e-9, "+50 % delta");
});

test("compareOutcome is backward-tolerant: null when no snapshot or no current value", () => {
  assert.equal(compareOutcome(undefined, 5), null, "pre-Direction-1 record → no chip");
  assert.equal(compareOutcome({ key: "ltvCac", metric: 2 }, undefined), null, "subject gone → no chip");
  assert.equal(compareOutcome({ key: "ltvCac", metric: 2 }, NaN), null, "non-finite current → no chip");
});

test("compareOutcome handles a zero baseline via a sign comparison (no divide-by-zero)", () => {
  assert.equal(compareOutcome({ key: "qualRate", metric: 0 }, 0.1).status, "improved");
  assert.equal(compareOutcome({ key: "qualRate", metric: 0 }, 0).status, "unchanged");
});

// --- already-resolved-unchanged guard -------------------------------------

test("alreadyResolvedUnchanged matches a resolved same-subject diagnosis with an unmoved metric", () => {
  const resolved = buildStoredDiagnosis(
    sanitizeDiagnosisInput({
      kind: "lead-source",
      result: { summary: "s", likelyCause: "spam", recommendation: "r" },
      subject: "Meta",
      snapshot: { key: "qualRate", metric: 0.2 },
    }),
    idOf
  );
  resolved.status = "resolved";
  const history = [resolved];
  const currentFor = () => 0.204; // within band → unchanged
  assert.equal(alreadyResolvedUnchanged(history, "lead-source", "Meta", currentFor), true);
  // a moved metric → not "already handled"
  assert.equal(alreadyResolvedUnchanged(history, "lead-source", "Meta", () => 0.3), false);
  // a different subject → no match
  assert.equal(alreadyResolvedUnchanged(history, "lead-source", "Sklik", currentFor), false);
  // a non-resolved diagnosis → no match
  resolved.status = "acknowledged";
  assert.equal(alreadyResolvedUnchanged(history, "lead-source", "Meta", currentFor), false);
});

// --- store sanitizer + round-trip -----------------------------------------

test("sanitizeDiagnosisSnapshot rejects unknown keys / non-finite metrics", () => {
  assert.equal(sanitizeDiagnosisSnapshot({ key: "nope", metric: 1 }), null);
  assert.equal(sanitizeDiagnosisSnapshot({ key: "ltvCac", metric: "x" }), null);
  assert.equal(sanitizeDiagnosisSnapshot({ key: "ltvCac", metric: Infinity }), null);
  assert.deepEqual(sanitizeDiagnosisSnapshot({ key: "coverage", metric: 0.4 }), {
    key: "coverage",
    metric: 0.4,
  });
});

test("sanitizeDiagnosisInput carries a valid snapshot and drops a bad one (backward tolerant)", () => {
  const withSnap = sanitizeDiagnosisInput({
    kind: "cohort",
    result: { summary: "s", worstCohort: "2025-01", recommendation: "r" },
    snapshot: { key: "ltvCac", metric: 1.5 },
  });
  assert.deepEqual(withSnap.snapshot, { key: "ltvCac", metric: 1.5 });
  const stored = buildStoredDiagnosis(withSnap, idOf);
  assert.deepEqual(stored.snapshot, { key: "ltvCac", metric: 1.5 });

  // A malformed snapshot is dropped, not fatal — the record just has no chip.
  const badSnap = sanitizeDiagnosisInput({
    kind: "cohort",
    result: { summary: "s", worstCohort: "2025-01", recommendation: "r" },
    snapshot: { key: "bogus", metric: 1 },
  });
  assert.equal(badSnap.snapshot, undefined);
  assert.equal(buildStoredDiagnosis(badSnap, idOf).snapshot, undefined);
});
