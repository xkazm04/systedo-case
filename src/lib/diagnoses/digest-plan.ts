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
 *  synthetic diagnosis.
 *
 *  Wave 1 adds a THIRD arm: the ads-performance diagnosis, for the (common) tenant
 *  whose only live data is its synced ad accounts. It runs when the project has a
 *  genuinely synced portfolio (`adsLive`) that actually spent in the window
 *  (`adsHasSignal`) — spend is the thing a diagnosis can act on, so a live-but-idle
 *  account is skipped honestly rather than diagnosed about nothing. Both arms may run
 *  for a tenant that has both (two charged units). */

/** No live cohort source exists — the cohort diagnosis never runs; this note is
 *  always recorded so the run record shows the skip was deliberate, not a failure. */
export const NOTE_COHORT_NO_LIVE = "cohort: no live basis";
/** The funnel resolved to the illustrative sample, not imported leads. */
export const NOTE_LEAD_NO_LIVE = "lead: no live basis";
/** Leads are imported, but no under-performing source stood out to diagnose. */
export const NOTE_LEAD_NO_SEED = "lead: no diagnosable source";
/** No genuinely synced ad account resolved — the portfolio is the illustrative sample. */
export const NOTE_ADS_NO_LIVE = "ads: no live basis";
/** The ad accounts are synced, but nothing spent in the window — nothing to diagnose. */
export const NOTE_ADS_NO_SIGNAL = "ads: no spend to diagnose";

export interface DigestDiagnosisPlanInput {
  /** resolveLeadSources.live — the funnel resolved to genuinely imported leads
   *  (not the seeded sample). Only then may a lead-source diagnosis run. */
  leadSourcesLive: boolean;
  /** an under-performing, diagnosable seed exists from the resolved sources */
  hasLeadSeed: boolean;
  /** the project resolves a genuinely SYNCED ad portfolio (Google Ads and/or Sklik),
   *  not the illustrative campaign sample. OPTIONAL on purpose: a caller that knows
   *  nothing about ads (the pre-Wave-1 shape) gets neither the ads arm nor an ads
   *  note, so its plan — including the note ORDER — is byte-identical to before. */
  adsLive?: boolean;
  /** at least one campaign spent in the window (cost > 0) — the signal a portfolio
   *  diagnosis can actually act on */
  adsHasSignal?: boolean;
}

export interface DigestDiagnosisPlan {
  /** run + charge the lead-source diagnosis this pass */
  runLead: boolean;
  /** run + charge the ads-performance diagnosis this pass. Independent of `runLead`:
   *  a tenant with both live funnels gets both (two charged units). */
  runAds: boolean;
  /** honest notes for the run record/results (always includes the cohort skip) */
  notes: string[];
}

/** Decide which passive diagnoses run for a tenant this pass. Pure and total. */
export function planDigestDiagnoses(input: DigestDiagnosisPlanInput): DigestDiagnosisPlan {
  const notes: string[] = [NOTE_COHORT_NO_LIVE];
  const runLead = input.leadSourcesLive && input.hasLeadSeed;
  if (!input.leadSourcesLive) notes.push(NOTE_LEAD_NO_LIVE);
  else if (!input.hasLeadSeed) notes.push(NOTE_LEAD_NO_SEED);

  // Ads arm. An ads-unaware caller (neither flag supplied) records NO ads note, so
  // the pre-Wave-1 note list stays byte-identical — the flags are what opts a caller
  // into the arm, not a defaulted `false` that would fabricate a skip reason.
  const adsAware = input.adsLive !== undefined || input.adsHasSignal !== undefined;
  const runAds = adsAware && !!input.adsLive && !!input.adsHasSignal;
  if (adsAware) {
    if (!input.adsLive) notes.push(NOTE_ADS_NO_LIVE);
    else if (!input.adsHasSignal) notes.push(NOTE_ADS_NO_SIGNAL);
  }
  return { runLead, runAds, notes };
}
