/** Per-project data spine. `getProjectDataset` returns one coherent performance
 *  dataset for a project, derived deterministically from the project (id →
 *  magnitude, type → baseline, name/domain → labels) over the shared base series.
 *  The overview, dashboard and profit modules all read this, so every surface
 *  reflects the SAME per-project reality instead of the global demo numbers.
 *
 *  Two layers of per-project derivation, both deterministic:
 *   1. MAGNITUDE + EFFICIENCY (scaledDataset) — a linear transform of the shared
 *      base: scale volumes by the project's magnitude, divide cost by its
 *      efficiency. This alone left every project tracing the SAME curve shape
 *      (identical seasonality, weekday profile, spike days) — a portfolio of
 *      scaled copies that read fake.
 *   2. SHAPE (applyProjectShape, project-only) — a per-type + per-project runtime
 *      re-shaping of the daily series so a leadgen project reads weekday-heavy, a
 *      local one weekend-tilted, each with its own gentle trend and day-level
 *      wobble. Applied UNIFORMLY across visits/cost/conversions/revenue so every
 *      derived ratio (ROAS, PNO, CPA, conversion rate) is pointwise identical to
 *      the scaled base — only WHICH days are high or low changes, never the unit
 *      economics. See applyProjectShape for the documented bounds. (Exception:
 *      conversions are floored at 1 on any day whose scaled value is positive but
 *      rounds to 0, so low-volume days stay ratio-safe — see roundCount.)
 *
 *  Live seam (Phase D): for a project with a connected Ads/analytics source,
 *  replace the scaled base with the project's synced data — the rest of the app
 *  consumes this shape unchanged. */
import { performance } from "@/lib/data";
import type { DailyPoint, PerformanceData } from "@/lib/types";
import type { Project, ProjectType } from "@/lib/projects/types";
import { projectEfficiency, projectScale, seed01, seedScale, TYPE_BASE_FOR } from "./seed";
// Shared demo core — the same seeded PRNG (mulberry32) + FNV-1a hash the other
// demo generators use (one implementation instead of copies).
import { mulberry32, hashStr } from "@/lib/demo/prng.mjs";

// The pure seeding primitives moved to ./seed (no data imports) so modules that
// only need a per-project factor don't transitively load this base dataset.
// Re-exported here for the existing call sites that import them from dataset.
export { seed01, seedScale, projectScale, projectEfficiency, TYPE_BASE_FOR };

/** Scale the base case-study dataset by a magnitude and relabel the client — the
 *  per-client spine for surfaces keyed by something other than a Project (e.g. a
 *  microsite slug), so each client reads as its own reality. `efficiency` (default
 *  1) divides cost independently of magnitude, so ROAS / PNO / CPA vary per client
 *  rather than being identical across scaled copies of one base.
 *
 *  Deliberately SHAPE-STABLE: this is the microsite / fixed-label path (see the
 *  slug caller in microsite.ts) and must stay byte-identical for a given scale.
 *  The per-type + per-project shape variation lives one layer up in
 *  `getProjectDataset`, gated on an actual Project, so these non-project callers
 *  are never re-shaped. */
export function scaledDataset(
  scale: number,
  label: { name: string; domain?: string },
  efficiency = 1
): PerformanceData {
  return {
    ...performance,
    client: {
      ...performance.client,
      name: label.name,
      domain: label.domain || performance.client.domain,
    },
    goals: { ...performance.goals, monthlyRevenue: Math.round(performance.goals.monthlyRevenue * scale) },
    daily: performance.daily.map((d) => ({
      date: d.date,
      visits: Math.round(d.visits * scale),
      cost: Math.round((d.cost * scale) / efficiency),
      // Floor a positive scaled count at 1 so a low-magnitude client never shows a
      // day with conversions=0 but cost>0 (which would break CPA / conv-rate).
      conversions: roundCount(d.conversions * scale),
      revenue: Math.round(d.revenue * scale),
    })),
  };
}

// ---------------------------------------------------------------------------
// Direction 1 — per-type + per-project runtime SHAPE variation.
// ---------------------------------------------------------------------------

/** UTC weekday index (0=Sun … 6=Sat), the same indexing the metrics engine's
 *  `dayOfWeek` uses, so a type's weekday signature and the anomaly de-seasonaliser
 *  agree on which day is which. */
function utcDay(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Per-type weekday SIGNATURE (index 0=Sun … 6=Sat) — the relative weight of each
 *  weekday BEFORE distribution-normalization. Encodes how each business type's
 *  demand actually falls across the week, so two projects of different types no
 *  longer trace the same curve:
 *   • eshop   — steady, mild mid-week lean, softer weekends
 *   • app     — weekday-driven acquisition, quieter weekends
 *   • leadgen — strongly B2B: Mon–Fri heavy, weekends near-dead
 *   • content — flatter, slight weekend lift (leisure reading)
 *   • local   — consumer weekend tilt (foot traffic Fri–Sun)
 *  Each raw weight sits within ±22% of 1; after normalization the applied tilt is
 *  re-centred so its distribution-weighted mean is exactly 1 (see applyProjectShape),
 *  which is what keeps totals inside the envelope. */
const TYPE_WEEKDAY_SIGNATURE: Record<ProjectType, readonly number[]> = {
  //          Sun    Mon    Tue    Wed    Thu    Fri    Sat
  eshop: [0.95, 1.05, 1.08, 1.06, 1.04, 0.98, 0.92],
  app: [0.9, 1.08, 1.1, 1.09, 1.06, 0.95, 0.88],
  leadgen: [0.78, 1.15, 1.18, 1.16, 1.12, 0.96, 0.75],
  content: [1.08, 0.96, 0.95, 0.96, 0.98, 1.05, 1.1],
  local: [1.1, 0.9, 0.9, 0.92, 1.0, 1.14, 1.16],
};

/** Max half-amplitude of the gentle per-project trend slope (±6% end-to-end). */
const TREND_MAX = 0.06;
/** Max half-amplitude of the per-project day-level wobble (±5%). Kept small so it
 *  never manufactures a false anomaly: the anomaly engine flags on a windowed
 *  z-score, and a ±5% daily jitter stays well under the |z| bar on this series. */
const WOBBLE_MAX = 0.05;
/** Hard per-day envelope for the COMBINED factor (tilt × trend × wobble). Clamped
 *  so no single day can drift more than ±25% from its scaled base, whatever the
 *  composition of the three components. */
const FACTOR_MIN = 0.75;
const FACTOR_MAX = 1.25;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Round a volume count, but never quantize a POSITIVE value down to 0. On a
 *  low-magnitude / low-type project (combined scale can sit near 0.3, then a shape
 *  factor as low as 0.75), a base day with 2–4 conversions rounds to 0 while
 *  cost/revenue (larger numerators) round nonzero — so the day shows conversions=0
 *  with spend>0, making CPA=cost/0 and conv-rate=0 on any daily drilldown. Flooring
 *  a positive scaled value at 1 keeps every day's derived ratios finite. This is the
 *  one documented exception to the "per-day ratios pointwise identical" invariant:
 *  as counts approach 0, integer quantization dominates and can't be avoided. */
function roundCount(v: number): number {
  const r = Math.round(v);
  return r === 0 && v > 0 ? 1 : r;
}

/** The per-day multiplicative shape factors for a project over `dates`, one per
 *  day, each already clamped to the [FACTOR_MIN, FACTOR_MAX] envelope. Exported for
 *  tests (determinism + bounds). Deterministic in the project id + type:
 *   - tilt:   TYPE_WEEKDAY_SIGNATURE, re-centred so its weighted mean over the
 *             actual weekday distribution of `dates` is exactly 1 (total-neutral).
 *   - trend:  a symmetric linear ramp from (1−slope) to (1+slope); slope seeded per
 *             project so direction + magnitude vary. Mean over the series = 1.
 *   - wobble: a small seeded ±WOBBLE jitter consumed in date order. Mean ≈ 1. */
export function projectShapeFactors(project: Project, dates: string[]): number[] {
  const n = dates.length;
  if (n === 0) return [];

  const sig = TYPE_WEEKDAY_SIGNATURE[project.type];
  // Re-centre the weekday signature against THIS series' weekday distribution so
  // the tilt contributes zero net drift to the totals (Σ tilt = n exactly).
  let sigSum = 0;
  const dow = dates.map((d) => utcDay(d));
  for (const w of dow) sigSum += sig[w]!;
  const sigMean = sigSum / n;

  // Per-project gentle trend slope, type-seeded so the same project keeps the same
  // trajectory and different types diverge; symmetric ramp → total-neutral.
  const slope = (seed01(`${project.id}:${project.type}:trend`) * 2 - 1) * TREND_MAX;

  // Seeded PRNG for the per-day wobble, consumed strictly in date order.
  const rnd = mulberry32(hashStr(`${project.id}:shape-wobble`));

  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const tilt = sig[dow[i]!]! / sigMean;
    const trend = n > 1 ? 1 + slope * ((2 * i) / (n - 1) - 1) : 1;
    const wobble = 1 + (rnd() * 2 - 1) * WOBBLE_MAX;
    out[i] = clamp(tilt * trend * wobble, FACTOR_MIN, FACTOR_MAX);
  }
  return out;
}

/** Re-shape a project's scaled dataset by the deterministic per-type + per-project
 *  shape factors. Applied UNIFORMLY to every volume metric on a day, so per-day
 *  derived ratios (ROAS/PNO/CPA/conv-rate) are pointwise IDENTICAL to `base` — only
 *  the temporal shape (which days run hot/cold, the weekday profile, the gentle
 *  trend) changes. The one exception is integer quantization at low magnitudes:
 *  conversions are floored at 1 on a positive-but-sub-0.5 day (roundCount) so a
 *  quiet day never reads conversions=0 with cost>0. Totals stay inside the envelope: the weekday tilt is mean-1 by
 *  construction, the trend is symmetric, the wobble is small and zero-mean, and the
 *  per-day clamp bounds any residual drift. Pure; leaves client/goals/meta/events/
 *  channels untouched. */
export function applyProjectShape(base: PerformanceData, project: Project): PerformanceData {
  const factors = projectShapeFactors(
    project,
    base.daily.map((d) => d.date)
  );
  const daily: DailyPoint[] = base.daily.map((d, i) => {
    const f = factors[i]!;
    const next: DailyPoint = {
      ...d,
      visits: Math.round(d.visits * f),
      cost: Math.round(d.cost * f),
      conversions: roundCount(d.conversions * f),
      revenue: Math.round(d.revenue * f),
    };
    // Scale the optional paid-traffic pair too when a (future live) series carries
    // it, so CTR/CPC stay ratio-stable under the same uniform factor.
    if (d.impressions !== undefined) next.impressions = Math.round(d.impressions * f);
    if (d.clicks !== undefined) next.clicks = Math.round(d.clicks * f);
    return next;
  });
  return { ...base, daily };
}

export function getProjectDataset(project: Project): PerformanceData {
  const scaled = scaledDataset(
    projectScale(project),
    { name: project.name, domain: project.domain || undefined },
    projectEfficiency(project)
  );
  return applyProjectShape(scaled, project);
}
