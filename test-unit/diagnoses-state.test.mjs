/** Persisted-diagnosis state transitions + wire sanitizers (src/lib/diagnoses/types.ts):
 *  the per-kind history cap, newest-first append, status lifecycle set, and the
 *  route's body coercion. Pure — no store I/O. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendDiagnosis,
  buildStoredDiagnosis,
  capPerKind,
  DIAGNOSIS_HISTORY_CAP,
  inputDigest,
  latestOfKind,
  sanitizeDiagnosisInput,
  setStatusIn,
} from "@/lib/diagnoses/types";

let seq = 0;
const idOf = () => `id-${++seq}`;

function cohort(result = {}) {
  return sanitizeDiagnosisInput({
    kind: "cohort",
    result: { summary: "s", worstCohort: "2025-01", recommendation: "r", ...result },
  });
}
function lead(result = {}) {
  return sanitizeDiagnosisInput({
    kind: "lead-source",
    result: { summary: "s", likelyCause: "spam", recommendation: "r", ...result },
  });
}

test("sanitizeDiagnosisInput rejects bad kind / missing fields / bad cause", () => {
  assert.equal(sanitizeDiagnosisInput({ kind: "nope", result: {} }), null);
  assert.equal(sanitizeDiagnosisInput({ kind: "cohort", result: { summary: "s" } }), null);
  assert.equal(
    sanitizeDiagnosisInput({ kind: "lead-source", result: { summary: "s", likelyCause: "xx", recommendation: "r" } }),
    null
  );
  const ok = cohort();
  assert.equal(ok.kind, "cohort");
  assert.equal(ok.subject, "2025-01"); // defaults to worstCohort
  assert.equal(ok.origin, "manual");
});

test("sanitizeDiagnosisInput keeps a valid severity + risks and defaults origin", () => {
  const l = sanitizeDiagnosisInput({
    kind: "lead-source",
    result: { summary: "s", likelyCause: "pricing", recommendation: "r", severity: "high" },
    subject: "Meta",
    origin: "digest",
  });
  assert.equal(l.result.severity, "high");
  assert.equal(l.subject, "Meta");
  assert.equal(l.origin, "digest");
});

test("capPerKind keeps at most N of each kind, newest-first order preserved", () => {
  const items = [];
  for (let i = 0; i < DIAGNOSIS_HISTORY_CAP + 5; i++) {
    items.push(buildStoredDiagnosis(cohort(), idOf));
  }
  items.push(buildStoredDiagnosis(lead(), idOf));
  const capped = capPerKind(items);
  assert.equal(capped.filter((x) => x.kind === "cohort").length, DIAGNOSIS_HISTORY_CAP);
  assert.equal(capped.filter((x) => x.kind === "lead-source").length, 1);
});

test("appendDiagnosis prepends and re-caps per kind", () => {
  let state = null;
  for (let i = 0; i < DIAGNOSIS_HISTORY_CAP + 3; i++) {
    state = appendDiagnosis(state, buildStoredDiagnosis(cohort(), idOf));
  }
  const cohorts = state.items.filter((x) => x.kind === "cohort");
  assert.equal(cohorts.length, DIAGNOSIS_HISTORY_CAP);
  // newest-first: the last appended id is at the front
  assert.equal(state.items[0].id, cohorts[0].id);
  // a lead-source append coexists with the capped cohorts
  state = appendDiagnosis(state, buildStoredDiagnosis(lead(), idOf));
  assert.equal(state.items[0].kind, "lead-source");
  assert.equal(latestOfKind(state, "lead-source").id, state.items[0].id);
  assert.equal(state.items.filter((x) => x.kind === "cohort").length, DIAGNOSIS_HISTORY_CAP);
});

test("setStatusIn updates by id and reports found; unknown id is not found", () => {
  const d = buildStoredDiagnosis(cohort(), idOf);
  const state = appendDiagnosis(null, d);
  assert.equal(state.items[0].status, "new");
  const { state: next, found } = setStatusIn(state, d.id, "resolved");
  assert.equal(found, true);
  assert.equal(next.items[0].status, "resolved");
  const miss = setStatusIn(state, "nope", "acknowledged");
  assert.equal(miss.found, false);
});

test("inputDigest is stable for equal input and differs for changed input", () => {
  const a = inputDigest({ cohorts: [1, 2, 3], eshop: true });
  const b = inputDigest({ cohorts: [1, 2, 3], eshop: true });
  const c = inputDigest({ cohorts: [1, 2, 4], eshop: true });
  assert.equal(a, b);
  assert.notEqual(a, c);
});
