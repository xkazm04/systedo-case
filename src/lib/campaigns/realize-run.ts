/** The I/O half of the realized-impact ledger (WP W2-E): read the tenant's
 *  change-sets, score the applied ones that have come due against the
 *  already-persisted per-campaign daily series, write the measurement back onto
 *  each set, and recompute the tenant's projection calibration from the ledger.
 *
 *  Kept apart from ./realize (pure math) so the math stays testable without a
 *  store, and so the sync pipeline can pull this in lazily — it is a best-effort
 *  post-save pass, not part of the sync contract.
 *
 *  Two honesty rules bound this file. It NEVER re-reads the provider: the
 *  measurement comes from the series doc the sync just wrote, so realization
 *  costs no quota and can never disagree with what the charts show. And it is
 *  only ever CALLED on a genuinely live sync (the gates in ./sync.ts) — scoring a
 *  projection against sample data would manufacture a track record out of demo
 *  numbers. Server-only. */
import "server-only";
import { tenantDocs } from "@/lib/tenant-docs/backend";
import { getCampaignSeries } from "./store";
import { listChangeSets } from "./control-plane";
import { realizeChangeSet } from "./realize";
import {
  computeCalibration,
  CALIBRATION_COLLECTION,
  CALIBRATION_DOC_ID,
  type Calibration,
} from "./calibration";
import type { CampaignPeriod } from "./types";

/** Same sub-collection `control-plane.ts` owns; the realization is an additive
 *  merge-set onto the existing documents, never a new store (TenantDocs is
 *  schemaless, so `realized` needs no migration). */
const CHANGE_SETS = "changeSets";

export interface RealizeRunResult {
  /** how many change-sets got a `realized` block written this pass */
  realized: number;
  /** the calibration as it now stands, or null when nothing was recomputed */
  calibration: Calibration | null;
}

/**
 * Score every applied-and-due change-set that has not been scored yet, then
 * refresh the tenant's calibration. Never throws — a realization outage must not
 * fail (or even colour) a sync, so every failure is logged and swallowed.
 *
 * Idempotent by construction: a set with a `realized` block is skipped, and
 * `realizeChangeSet` returns null for anything not yet due, so re-running the
 * pass on the same day is a no-op rather than a re-measurement.
 */
export async function realizeAppliedChangeSets(
  tenant: string,
  period: CampaignPeriod
): Promise<RealizeRunResult> {
  try {
    const sets = await listChangeSets(tenant);
    if (sets.length === 0) return { realized: 0, calibration: null };

    // `approvedAt` is stamped even on a FAILED settle, and there is no `appliedAt`
    // in the model — so `status === "applied"` is the only honest filter for "this
    // set actually landed on the account and is worth measuring".
    const candidates = sets.filter((s) => s.status === "applied" && !s.realized);

    let realized = 0;
    if (candidates.length > 0) {
      const store = await tenantDocs();
      const seriesById = await getCampaignSeries(tenant, period);
      const now = Date.now();
      for (const cs of candidates) {
        const measurement = realizeChangeSet(cs, seriesById, now);
        if (!measurement) continue; // not due yet — the next sync tries again
        try {
          await store.setDoc(tenant, CHANGE_SETS, cs.id, { realized: measurement }, { merge: true });
          // keep the in-memory ledger in step so the calibration below sees this
          // pass's own measurements without a second read
          cs.realized = measurement;
          realized++;
        } catch (err) {
          console.error(`[campaigns] realized write failed for ${cs.id}:`, err);
        }
      }
    }

    // Recompute over the WHOLE ledger, not just this pass's additions: the median
    // is a property of the history, and a set realized by an earlier pass still
    // counts. Written every pass so a previously-failed write self-heals.
    const calibration = computeCalibration(sets);
    try {
      await (await tenantDocs()).setDoc(tenant, CALIBRATION_COLLECTION, CALIBRATION_DOC_ID, {
        ...calibration,
      });
    } catch (err) {
      console.error(`[campaigns] calibration write failed for ${tenant}:`, err);
      return { realized, calibration: null };
    }
    return { realized, calibration };
  } catch (err) {
    console.error(`[campaigns] realized-impact pass failed for ${tenant}:`, err);
    return { realized: 0, calibration: null };
  }
}
