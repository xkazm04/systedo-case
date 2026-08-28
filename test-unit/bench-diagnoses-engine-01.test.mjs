/** Bench regression (diagnoses-engine-01): a wire-forgeable origin:"digest".
 *  sanitizeDiagnosisInput accepts `origin` straight from the client body, and the
 *  user-facing persist route stores it verbatim — the weekly cron then gates its
 *  once-per-week digest run on the newest origin==="digest" diagnosis, so any
 *  client POST can suppress the real digest for 6 days (and forge provenance in
 *  the history UI). Correct behaviour: a plain (wire-facing) sanitizeDiagnosisInput
 *  call never yields origin "digest" — only the server-side digest writer may
 *  stamp it (via a server-only option/overwrite, not the wire). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeDiagnosisInput } from "@/lib/diagnoses/types";

const cohortWire = (over = {}) => ({
  kind: "cohort",
  result: { summary: "s", worstCohort: "2025-01", recommendation: "r" },
  ...over,
});

test('wire-supplied origin:"digest" is not trusted — it sanitizes to "manual"', () => {
  const out = sanitizeDiagnosisInput(cohortWire({ origin: "digest" }));
  assert.ok(out, "a valid diagnosis body still sanitizes");
  assert.equal(
    out.origin,
    "manual",
    'a client body must not be able to stamp origin:"digest" (it suppresses the weekly digest cron and forges provenance)'
  );
});

test('the default and explicit "manual" origins are unchanged', () => {
  assert.equal(sanitizeDiagnosisInput(cohortWire()).origin, "manual", "omitted origin defaults to manual");
  assert.equal(
    sanitizeDiagnosisInput(cohortWire({ origin: "manual" })).origin,
    "manual",
    "explicit manual stays manual"
  );
  assert.equal(
    sanitizeDiagnosisInput(cohortWire({ origin: "bogus" })).origin,
    "manual",
    "unknown origins still fall back to manual"
  );
});
