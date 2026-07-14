/** Direction 1 — the pure run/skip decision for the weekly-digest "Diagnóza týdne"
 *  (src/lib/diagnoses/digest-plan.ts): the cohort diagnosis is always skipped
 *  honestly (no live cohort store), and the lead-source diagnosis runs ONLY on
 *  genuinely imported leads with a diagnosable seed. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planDigestDiagnoses,
  NOTE_COHORT_NO_LIVE,
  NOTE_LEAD_NO_LIVE,
  NOTE_LEAD_NO_SEED,
} from "@/lib/diagnoses/digest-plan";

test("cohort is always skipped honestly — the note is recorded every pass", () => {
  for (const leadSourcesLive of [true, false]) {
    for (const hasLeadSeed of [true, false]) {
      const plan = planDigestDiagnoses({ leadSourcesLive, hasLeadSeed });
      assert.ok(plan.notes.includes(NOTE_COHORT_NO_LIVE), "cohort note always present");
    }
  }
});

test("lead diagnosis runs only on genuinely imported leads with a seed", () => {
  const plan = planDigestDiagnoses({ leadSourcesLive: true, hasLeadSeed: true });
  assert.equal(plan.runLead, true);
  // Only the cohort skip note — the lead one ran, so no lead skip note.
  assert.deepEqual(plan.notes, [NOTE_COHORT_NO_LIVE]);
});

test("a live tenant WITHOUT imported leads (sample funnel) gets NO lead diagnosis", () => {
  const plan = planDigestDiagnoses({ leadSourcesLive: false, hasLeadSeed: true });
  assert.equal(plan.runLead, false);
  assert.ok(plan.notes.includes(NOTE_LEAD_NO_LIVE), "records the honest no-live-basis note");
});

test("imported leads but no under-performing seed → skip with a distinct note", () => {
  const plan = planDigestDiagnoses({ leadSourcesLive: true, hasLeadSeed: false });
  assert.equal(plan.runLead, false);
  assert.ok(plan.notes.includes(NOTE_LEAD_NO_SEED));
  assert.ok(!plan.notes.includes(NOTE_LEAD_NO_LIVE), "not a no-live-basis skip");
});
