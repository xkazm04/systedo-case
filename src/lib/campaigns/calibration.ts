/** Feedback from realized impact back into the forward projection. Pure — no I/O;
 *  the runner (./realize-run) persists what this computes and `createChangeSet`
 *  reads it back.
 *
 *  The projection in ./simulate is a linear marginal model: it re-points spend at
 *  the recipient's CURRENT efficiency and assumes that efficiency holds. Reality
 *  rarely obliges. Once enough applied change-sets have been measured
 *  (./realize), the median of realized-over-projected is a one-number correction
 *  the next projection can carry.
 *
 *  Three deliberate conservatisms, because a self-calibrating forecast that gets
 *  it wrong is worse than one that never tried:
 *   - MEDIAN, not mean — one freak week (a sale, an outage) cannot move it;
 *   - a CLAMP, so even a run of freak weeks can only nudge the projection inside
 *     a band a human would still call plausible;
 *   - a MINIMUM history, below which the multiplier is exactly 1 and the
 *     projection is byte-identical to the uncalibrated one.
 *  And the result is always DISCLOSED on the set it shaped (`AppliedCalibration`)
 *  — a silently calibrated projection would be worse than an uncalibrated one. */
import type { ChangeSet } from "./control-plane-types";

/** Below this many measured change-sets the multiplier stays 1: three points is
 *  the least that can produce a median rather than an average of one accident. */
export const CALIBRATION_MIN_SETS = 3;

/** The band the multiplier is clamped into. Outside it the calibration would be
 *  claiming the projection is off by more than a factor the linear model's own
 *  error bars can justify — at that point the honest move is to cap the
 *  correction, not to trust it further. */
export const CALIBRATION_CLAMP: readonly [number, number] = [0.3, 1.5];

/** The sub-collection + document id the calibration lives at, under
 *  `tenants/{tenant}` on the {@link import("@/lib/tenant-docs/backend").TenantDocs}
 *  seam (ADR-0001 — both backends by construction). One doc per tenant. */
export const CALIBRATION_COLLECTION = "calibration";
export const CALIBRATION_DOC_ID = "budget-shift";

export interface Calibration {
  /** the factor applied to a projection's RECIPIENT gains; exactly 1 = uncalibrated */
  multiplier: number;
  /** how many measured change-sets the multiplier was derived from */
  n: number;
  updatedAt: string;
  /** why the multiplier is 1 despite this being a computed calibration */
  reason?: "insufficient-history";
}

/** The identity calibration — what every tenant runs under until it has history. */
export function neutralCalibration(now: number, n = 0): Calibration {
  return { multiplier: 1, n, updatedAt: new Date(now).toISOString(), reason: "insufficient-history" };
}

function median(sorted: number[]): number {
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(v: number): number {
  const [lo, hi] = CALIBRATION_CLAMP;
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Derive the tenant's calibration from its change-set ledger.
 *
 * Only sets whose realization came back `measured` with a usable `ratio` count —
 * an `insufficient` measurement and one scored against a non-positive projection
 * both carry `ratio: null` and are excluded rather than treated as a ratio of
 * zero, which would drag the multiplier down on missing data.
 */
export function computeCalibration(
  sets: Array<Pick<ChangeSet, "realized">>,
  now: number = Date.now()
): Calibration {
  const ratios: number[] = [];
  for (const s of sets) {
    const r = s.realized;
    if (!r || r.status !== "measured") continue;
    if (typeof r.ratio !== "number" || !Number.isFinite(r.ratio)) continue;
    if (!(r.projectedValueGain > 0)) continue;
    ratios.push(r.ratio);
  }
  const n = ratios.length;
  if (n < CALIBRATION_MIN_SETS) return neutralCalibration(now, n);
  ratios.sort((a, b) => a - b);
  return { multiplier: clamp(median(ratios)), n, updatedAt: new Date(now).toISOString() };
}

/** Read a stored calibration document back into the typed shape, or null when the
 *  doc is absent or does not hold a usable multiplier. Defensive because the doc
 *  is schemaless on both backends and feeds a number straight into a projection:
 *  anything that is not a finite multiplier inside the clamp reads as "no
 *  calibration" and the projection stays uncalibrated. */
export function parseCalibration(data: unknown): Calibration | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const multiplier = d.multiplier;
  const n = d.n;
  if (typeof multiplier !== "number" || !Number.isFinite(multiplier)) return null;
  const [lo, hi] = CALIBRATION_CLAMP;
  if (multiplier !== 1 && (multiplier < lo || multiplier > hi)) return null;
  return {
    multiplier,
    n: typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0,
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : "",
    ...(d.reason === "insufficient-history" ? { reason: "insufficient-history" as const } : {}),
  };
}
