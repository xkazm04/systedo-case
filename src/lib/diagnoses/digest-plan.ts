/** Pure run/skip decision for the weekly-digest "Diagnóza týdne" (Direction 1):
 *  which passive diagnoses may honestly run for a tenant, given what real data
 *  actually resolves. Kept free of any I/O so the integrity rule — never diagnose
 *  sample data as if it were the client's own — is unit-testable in isolation.
 *
 *  Two diagnoses were fired before: the LTV cohort one and the lead-source one.
 *  There is NO live cohort store, so the cohort diagnosis is skipped honestly here
 *  (no LLM call, no spend, a recorded note). The lead-source diagnosis runs ONLY
 *  when resolveLeadSources resolved genuinely imported leads (`live`) AND an
 *  under-performing seed exists — a connected tenant WITHOUT imported leads gets no
 *  synthetic diagnosis. */

/** No live cohort source exists — the cohort diagnosis never runs; this note is
 *  always recorded so the run record shows the skip was deliberate, not a failure. */
export const NOTE_COHORT_NO_LIVE = "cohort: no live basis";
/** The funnel resolved to the illustrative sample, not imported leads. */
export const NOTE_LEAD_NO_LIVE = "lead: no live basis";
/** Leads are imported, but no under-performing source stood out to diagnose. */
export const NOTE_LEAD_NO_SEED = "lead: no diagnosable source";

export interface DigestDiagnosisPlanInput {
  /** resolveLeadSources.live — the funnel resolved to genuinely imported leads
   *  (not the seeded sample). Only then may a lead-source diagnosis run. */
  leadSourcesLive: boolean;
  /** an under-performing, diagnosable seed exists from the resolved sources */
  hasLeadSeed: boolean;
}

export interface DigestDiagnosisPlan {
  /** run + charge the lead-source diagnosis this pass */
  runLead: boolean;
  /** honest notes for the run record/results (always includes the cohort skip) */
  notes: string[];
}

/** Decide which passive diagnoses run for a tenant this pass. Pure and total. */
export function planDigestDiagnoses(input: DigestDiagnosisPlanInput): DigestDiagnosisPlan {
  const notes: string[] = [NOTE_COHORT_NO_LIVE];
  const runLead = input.leadSourcesLive && input.hasLeadSeed;
  if (!input.leadSourcesLive) notes.push(NOTE_LEAD_NO_LIVE);
  else if (!input.hasLeadSeed) notes.push(NOTE_LEAD_NO_SEED);
  return { runLead, notes };
}
