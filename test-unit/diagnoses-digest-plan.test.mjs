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
  NOTE_ADS_NO_LIVE,
  NOTE_ADS_NO_SIGNAL,
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

// ── WP W1-D: the ads arm ──────────────────────────────────────────────────────
// The lead-only cases above are unchanged BY CONSTRUCTION: an ads-unaware caller
// supplies neither flag and gets neither the arm nor a note.

test("an ads-live tenant with spend gets the ads diagnosis — the pinned acceptance case", () => {
  const plan = planDigestDiagnoses({
    leadSourcesLive: false,
    hasLeadSeed: false,
    adsLive: true,
    adsHasSignal: true,
  });
  assert.equal(plan.runLead, false, "no imported leads → no lead diagnosis");
  assert.equal(plan.runAds, true, "ads is the tenant's ONLY live basis, and it spent");
  assert.deepEqual(
    plan.notes,
    [NOTE_COHORT_NO_LIVE, NOTE_LEAD_NO_LIVE],
    "the ads arm ran, so it records no skip note; note ORDER is cohort → lead → ads"
  );
});

test("a synced-but-idle ad account is skipped with its own distinct note", () => {
  const plan = planDigestDiagnoses({
    leadSourcesLive: true,
    hasLeadSeed: true,
    adsLive: true,
    adsHasSignal: false,
  });
  assert.equal(plan.runAds, false, "no spend in the window → nothing to act on");
  assert.deepEqual(plan.notes, [NOTE_COHORT_NO_LIVE, NOTE_ADS_NO_SIGNAL]);
  assert.equal(plan.runLead, true, "the arms are independent");
});

test("a sample-only portfolio is never diagnosed as if it were the client's own", () => {
  const plan = planDigestDiagnoses({
    leadSourcesLive: false,
    hasLeadSeed: false,
    adsLive: false,
    adsHasSignal: true,
  });
  assert.equal(plan.runAds, false);
  assert.deepEqual(plan.notes, [NOTE_COHORT_NO_LIVE, NOTE_LEAD_NO_LIVE, NOTE_ADS_NO_LIVE]);
});

test("both funnels live → BOTH diagnoses run (two charged units) and no skip note", () => {
  const plan = planDigestDiagnoses({
    leadSourcesLive: true,
    hasLeadSeed: true,
    adsLive: true,
    adsHasSignal: true,
  });
  assert.equal(plan.runLead, true);
  assert.equal(plan.runAds, true);
  assert.deepEqual(plan.notes, [NOTE_COHORT_NO_LIVE]);
});

test("an ads-UNAWARE caller keeps the pre-Wave-1 plan byte-identical", () => {
  const plan = planDigestDiagnoses({ leadSourcesLive: true, hasLeadSeed: true });
  assert.equal(plan.runAds, false, "no flags → the arm cannot run");
  assert.deepEqual(plan.notes, [NOTE_COHORT_NO_LIVE], "and no ads note is fabricated");
});
