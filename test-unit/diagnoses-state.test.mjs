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
  DIGEST_VERSION,
  digestFreshness,
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

test("sanitizeDiagnosisInput keeps a valid severity + risks and never trusts the wire's origin", () => {
  const body = {
    kind: "lead-source",
    result: { summary: "s", likelyCause: "pricing", recommendation: "r", severity: "high" },
    subject: "Meta",
    origin: "digest", // forged on the wire — must not survive
  };
  const l = sanitizeDiagnosisInput(body);
  assert.equal(l.result.severity, "high");
  assert.equal(l.subject, "Meta");
  assert.equal(l.origin, "manual", "a client cannot forge digest provenance (it gates the weekly cron)");
  // Only a trusted server-side caller (the digest cron) can stamp "digest".
  assert.equal(sanitizeDiagnosisInput(body, { origin: "digest" }).origin, "digest");
  assert.equal(sanitizeDiagnosisInput(body, { origin: "nope" }).origin, "manual");
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

// --- Direction 2 — stale-badge digest ------------------------------------

test("inputDigest is key-order-independent (stable stringify) and version-prefixed", () => {
  const a = inputDigest({ a: 1, b: { x: 10, y: 20 }, c: [1, 2] });
  const b = inputDigest({ c: [1, 2], b: { y: 20, x: 10 }, a: 1 }); // keys reordered
  assert.equal(a, b, "reordering keys must not change the digest");
  assert.ok(a.startsWith(`${DIGEST_VERSION}:`), "digest carries the format version prefix");
  // Array order IS meaningful — reordering an array must change the digest.
  assert.notEqual(inputDigest({ v: [1, 2] }), inputDigest({ v: [2, 1] }));
  // undefined-valued keys are dropped (JSON would omit them) — same as omitting them.
  assert.equal(inputDigest({ a: 1, b: undefined }), inputDigest({ a: 1 }));
});

test("digestFreshness resolves fresh / stale for current-format digests", () => {
  const cur = inputDigest({ n: 1 });
  assert.equal(digestFreshness(cur, cur), "fresh");
  assert.equal(digestFreshness(inputDigest({ n: 2 }), cur), "stale", "current-format mismatch is a hard stale");
  assert.equal(digestFreshness(undefined, cur), "unknown");
  assert.equal(digestFreshness("", cur), "unknown");
});

test("digestFreshness is backward-tolerant — an OLD-format digest is unknown, never stale", () => {
  const cur = inputDigest({ n: 1 });
  // A pre-versioned digest (bare base36, no "N:" prefix) can't be compared to the
  // new stable digest, so it must read as unknown-age — never a hard mismatch claim.
  const legacy = "abc123";
  assert.equal(digestFreshness(legacy, cur), "unknown");
  // Even if it happens to differ from the current, it stays soft (not "stale").
  assert.notEqual(legacy, cur);
});
