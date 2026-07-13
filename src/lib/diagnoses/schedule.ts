/** Pure scheduling decision for the weekly-digest "Diagnóza týdne" (Direction 2):
 *  whether the digest cron should passively run the diagnosis tools for a tenant on
 *  this pass. Kept free of any I/O so the once-per-week + skip-sample-only rules are
 *  unit-testable with synthetic inputs. The cron supplies `hasLiveData` (does the
 *  tenant have connected live Ads data — sample-only tenants are skipped so passive
 *  AI spend never lands on demo data) and `lastRunAt` (the newest digest-produced
 *  diagnosis timestamp, so a re-run or manual cron trigger inside the window doesn't
 *  double-file). */

/** Minimum gap between passive digest diagnoses for a tenant — 6 days, so a weekly
 *  schedule always fires but a mid-week re-run / manual trigger is suppressed. */
export const WEEKLY_DIAGNOSIS_MIN_GAP_MS = 6 * 24 * 60 * 60 * 1000;

export interface WeeklyDiagnosisInput {
  /** does the tenant have connected live data? sample-only tenants are skipped */
  hasLiveData: boolean;
  /** ISO timestamp of the newest digest-produced diagnosis, or null if none yet */
  lastRunAt: string | null;
  /** current wall-clock (ms) — injected so tests are deterministic */
  now: number;
  /** override the min gap (tests) */
  minGapMs?: number;
}

/** True iff the digest should run the diagnosis for this tenant now: it must have
 *  live data AND either never have had a digest diagnosis or the last one is older
 *  than the min gap. An unparseable `lastRunAt` is treated as "no prior run" (run),
 *  never as a silent forever-skip. */
export function shouldRunWeeklyDiagnosis(input: WeeklyDiagnosisInput): boolean {
  if (!input.hasLiveData) return false;
  if (!input.lastRunAt) return true;
  const last = Date.parse(input.lastRunAt);
  if (Number.isNaN(last)) return true;
  const gap = input.minGapMs ?? WEEKLY_DIAGNOSIS_MIN_GAP_MS;
  return input.now - last >= gap;
}
