/** WP S3 — the `conversion-drain` ledger step: the ONLY place in this product that
 *  sends a customer's conversion rows to a third-party processor.
 *
 *  WHAT MAKES THIS RUNG DIFFERENT. Every other ledger step is idempotent by
 *  construction — the rollup recomputes a blob, the retry re-POSTs something whose
 *  receiver deduplicates, the prune finds nothing left to delete. This one is not:
 *  Google counts the same gclid twice if it is posted twice against the same
 *  conversion action, and offers no retraction. So the step carries FOUR independent
 *  guards, and each of them is pinned in test-unit/conversions-drain.test.mjs:
 *
 *   1. **A frozen authorisation.** Nothing is sent unless the project's mapping is
 *      `approved` (`isDrainEligible`), which the route only mints after a dry run the
 *      operator saw within the last 24 h. `paused` stops the next tick dead.
 *   2. **A per-row marker, written in the same pass the acceptance was read.** A row
 *      Google accepted gets `uploaded` on the spot; the next query excludes it. Run
 *      the drain twice in a row and the second run sends zero rows.
 *   3. **A daily claim.** `claimSentPeriod(tenant, "ledger-conversion-drain", isoDay)`
 *      — this is the FIRST genuine claimant among the ledger steps, and it exists to
 *      bound the window in which two overlapping invocations could both read the same
 *      un-marked rows before either marked them. It is RELEASED when the transport
 *      threw and nothing was sent, so the next hour retries rather than the project
 *      silently losing its day.
 *   4. **A failure ceiling.** A row that Google rejected is marked with `uploadError`,
 *      never with `uploaded`, and after DRAIN_MAX_ATTEMPTS the drain stops re-offering
 *      it — a permanently malformed gclid must not consume the batch forever.
 *
 *  Demo projects are skipped: their ledgers are illustrative, and an illustrative
 *  conversion in a real Google Ads account is a fabricated number in someone's
 *  reporting. Server-only. */
import "server-only";
import type { LedgerStep, LedgerStepResult } from "@/lib/cron/ledgers";
import { buildTenantKey } from "@/lib/campaigns/store-keys";
import { getAdsConnection } from "@/lib/campaigns/connection";
import { getUserAccessToken } from "@/lib/google/token";
import { claimSentPeriod, releaseSentPeriod } from "@/lib/cron/sent-guard";
import { adsConfigured, classifyLiveError, uploadClickConversions } from "@/lib/google/ads";
import { resolveProjectKind } from "@/lib/projects/demo";
import type { ConversionEvent } from "@/lib/leads/conversion-events";
import { appendConversionEvents, listConversionEvents, listConversionTenants } from "@/lib/leads/conversion-store";
import { buildGoogleUploadRows, kindIsMapped } from "./google-upload";
import {
  DRAIN_BATCH,
  DRAIN_MAX_ATTEMPTS,
  getConversionUploadMapping,
  isDrainEligible,
  mutateConversionUploadMapping,
  recordDrain,
  type ConversionUploadMapping,
} from "./mapping";

/** The step id — also the `ledger-conversion-drain` sent-guard kind, the run
 *  record's key, and the namespace its counts are reported under. */
export const CONVERSION_DRAIN_STEP_ID = "conversion-drain";

/** Tenants considered per tick. */
export const DRAIN_TENANT_SCAN = 500;
/** Un-uploaded rows READ per tenant before the batch is cut. Larger than
 *  DRAIN_BATCH so rows parked on `uploadError` do not hide the sendable ones behind
 *  them. */
export const DRAIN_ROW_SCAN = 1000;
/** How often the step runs. Hourly: the daily claim means at most one project-day is
 *  ever sent, and the extra ticks exist so a transient failure is retried the same
 *  day instead of waiting 24 h. */
const DUE_INTERVAL_MS = 3_600_000;

export const conversionDrainStep: LedgerStep = {
  id: CONVERSION_DRAIN_STEP_ID,
  due: (now, lastRunAt) => {
    if (!lastRunAt) return true;
    const t = Date.parse(lastRunAt);
    // An unparseable stamp reads as "never ran" — the same safe default the registry
    // applies to a missing record.
    if (!Number.isFinite(t)) return true;
    return now.getTime() - t >= DUE_INTERVAL_MS;
  },
  run: (ctx) => runConversionDrain(ctx.now),
};

export interface ConversionDrainCounts {
  projects: number;
  uploaded: number;
  failed: number;
  skipped: number;
  claimed: number;
  [k: string]: number;
}

/** A short, DETERMINISTIC batch suffix — a 6-char base-36 digest of the project, the
 *  day and the first row. Deterministic rather than random so a batch id can be
 *  reproduced from the ledger when reconciling against Google's own report, and so
 *  the pinned fixture asserts a real value rather than a regex. */
function batchSuffix(projectId: string, isoDay: string, firstGclid: string): string {
  let h = 0x811c9dc5;
  for (const ch of `${projectId}:${isoDay}:${firstGclid}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(6, "0").slice(-6);
}

/** How many times this row has already been rejected. */
function attemptsOf(e: ConversionEvent): number {
  const n = e.uploadError?.attempts;
  return Number.isFinite(n) && typeof n === "number" && n > 0 ? Math.trunc(n) : 0;
}

/** The rows this tick may send: mapped kind, carries a click id, not yet uploaded,
 *  and not past the failure ceiling. Pure, so the ceiling is testable without a
 *  store. Exported for the route's dry run, which must offer the operator EXACTLY
 *  the set a drain would take. */
export function drainCandidates(
  events: readonly ConversionEvent[],
  mapping: ConversionUploadMapping,
  limit: number = DRAIN_BATCH
): ConversionEvent[] {
  const out: ConversionEvent[] = [];
  for (const e of events) {
    if (e.uploaded) continue;
    if (!kindIsMapped(mapping, e.kind)) continue;
    if (!e.attribution.gclid?.trim()) continue;
    if (attemptsOf(e) >= DRAIN_MAX_ATTEMPTS) continue;
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

/** Turn one batch's outcome into the rows to persist. Pure — this is the function
 *  the "failures never mark" invariant lives in, so it is asserted directly.
 *
 *  An accepted row gains `uploaded` and LOSES any previous `uploadError`: the row is
 *  settled, and leaving a stale error on it would keep it in the card's "stuck" count
 *  forever. A rejected row gains `uploadError` with `attempts` incremented and never
 *  gains `uploaded`. A row Google mentioned in neither list is left untouched, so it
 *  is simply re-offered next tick. */
export function markUploadOutcome(
  batch: readonly ConversionEvent[],
  outcome: { accepted: readonly string[]; failed: readonly { gclid: string; message: string }[] },
  meta: { at: string; batchId: string; action: string }
): ConversionEvent[] {
  const accepted = new Set(outcome.accepted);
  const failed = new Map(outcome.failed.map((f) => [f.gclid, f.message]));
  const out: ConversionEvent[] = [];
  for (const e of batch) {
    const gclid = e.attribution.gclid?.trim() ?? "";
    if (accepted.has(gclid)) {
      const { uploadError: _dropped, ...rest } = e;
      out.push({
        ...rest,
        uploaded: { platform: "google-ads", at: meta.at, batchId: meta.batchId, action: meta.action },
      });
      continue;
    }
    const message = failed.get(gclid);
    if (message === undefined) continue;
    out.push({
      ...e,
      uploadError: { at: meta.at, message: message.slice(0, 500), attempts: attemptsOf(e) + 1 },
    });
  }
  return out;
}

/** One tenant's drain. Returns the deltas the tick's counters add up. Never throws:
 *  one project's broken account must not cost every other project its upload. */
async function drainTenant(
  userId: string,
  projectId: string,
  now: Date,
  isoDay: string
): Promise<{ projects: number; uploaded: number; failed: number; skipped: number; claimed: number }> {
  const none = { projects: 0, uploaded: 0, failed: 0, skipped: 1, claimed: 0 };
  if (resolveProjectKind(projectId) === "demo") return none;

  const mapping = await getConversionUploadMapping(userId, projectId);
  if (!isDrainEligible(mapping)) return none;

  const tenant = buildTenantKey(userId, projectId);
  const kind = `ledger-${CONVERSION_DRAIN_STEP_ID}` as const;
  // CLAIM FIRST — before a single row is read, let alone sent.
  if (!(await claimSentPeriod(tenant, kind, isoDay))) return none;

  let sentAnything = false;
  try {
    const pending = await listConversionEvents(projectId, { uploaded: false, limit: DRAIN_ROW_SCAN });
    const batch = drainCandidates(pending, mapping);
    if (batch.length === 0) {
      // Nothing to send. The claim STAYS: the day's work is genuinely done, and
      // releasing it would just re-scan the same empty ledger every hour.
      return { projects: 1, uploaded: 0, failed: 0, skipped: 0, claimed: 1 };
    }

    const connection = await getAdsConnection(userId);
    const token = connection ? await getUserAccessToken(userId) : null;
    if (!connection || !token) {
      // Approved, but the account went away (disconnected, or the session's Google
      // grant lapsed). Nothing was attempted, so hand the day back.
      await releaseClaim(tenant, kind, isoDay);
      return none;
    }

    const rows = buildGoogleUploadRows(batch, mapping);
    // validateOnly is NEVER set here — see google/ads.ts. This call is the send.
    const outcome = await uploadClickConversions(token, connection.customerId, rows);
    sentAnything = true;

    const batchId = `${isoDay}_${batchSuffix(projectId, isoDay, rows[0]?.gclid ?? "")}`;
    const marked = markUploadOutcome(batch, outcome, {
      at: now.toISOString(),
      batchId,
      action: mapping.conversionAction!.resourceName,
    });
    // The marking write is the guarantee. It happens in the SAME pass as the read of
    // the acceptance, and it upserts by event id, so it can neither mint a duplicate
    // row nor leave an accepted row unmarked for a second tick to re-send.
    await appendConversionEvents(projectId, marked);
    await mutateConversionUploadMapping(userId, projectId, now, (m) =>
      recordDrain(m, { uploaded: outcome.accepted.length, failed: outcome.failed.length, batchId }, now)
    );
    return {
      projects: 1,
      uploaded: outcome.accepted.length,
      failed: outcome.failed.length,
      skipped: 0,
      claimed: 1,
    };
  } catch (err) {
    // THE RELEASE RULE. A transport-level failure (network, 401, 429, 5xx) means the
    // batch never landed, so the day is handed back and the next hourly tick retries
    // it. A `permanent` classification (400/403 — a malformed request, a revoked
    // developer token) will fail identically in an hour, so the claim is KEPT and the
    // project is retried tomorrow rather than hammered twelve more times today.
    // Either way nothing was marked, so no row can have been lost.
    const cls = classifyLiveError(err);
    if (!sentAnything && cls !== "permanent") await releaseClaim(tenant, kind, isoDay);
    console.error(`[conversions] drain failed for ${projectId} (${cls}):`, err);
    return { projects: 0, uploaded: 0, failed: 0, skipped: 1, claimed: 1 };
  }
}

/** Release, best-effort — a failed release must never mask the failure that caused it. */
async function releaseClaim(tenant: string, kind: `ledger-${string}`, isoDay: string): Promise<void> {
  try {
    await releaseSentPeriod(tenant, kind, isoDay);
  } catch (err) {
    console.error(`[conversions] drain claim release failed for ${tenant}:`, err);
  }
}

/** One tick's work across every tenant that holds ledger rows. */
export async function runConversionDrain(now: Date): Promise<LedgerStepResult> {
  const counts: ConversionDrainCounts = { projects: 0, uploaded: 0, failed: 0, skipped: 0, claimed: 0 };
  // No developer token → no live Ads call is possible at all. Reporting `ok` with
  // zero work is the honest answer; failing would paint every local/dev deploy red.
  if (!adsConfigured()) return { ok: true, counts };

  let tenants;
  try {
    tenants = await listConversionTenants(DRAIN_TENANT_SCAN);
  } catch (err) {
    return { ok: false, counts, error: err instanceof Error ? err.message : String(err) };
  }

  const isoDay = now.toISOString().slice(0, 10);
  for (const { userId, projectId } of tenants) {
    try {
      const d = await drainTenant(userId, projectId, now, isoDay);
      counts.projects += d.projects;
      counts.uploaded += d.uploaded;
      counts.failed += d.failed;
      counts.skipped += d.skipped;
      counts.claimed += d.claimed;
    } catch (err) {
      counts.skipped += 1;
      console.error(`[conversions] drain tenant ${projectId} threw:`, err);
    }
  }
  // `failed` counts REJECTED ROWS, which is normal traffic (a stale gclid, a
  // conversion outside the action's click window), not a broken step. The step is
  // `ok` unless it could not enumerate its tenants at all.
  return { ok: true, counts };
}
