/** Rule-based triage for the campaign portfolio — the "what needs attention now"
 *  layer that turns raw metrics into Google-Ads / Optmyzr-style alerts. Pure: no
 *  React, no Tailwind, no DB, so it is shared by the table cells, the per-row
 *  badges and the summary banner. The thresholds reuse the same agreed target
 *  constants that colour the ROAS / PNO cells, so the badge, the cell colour and
 *  the banner can never disagree. */
import { fmtCZK, fmtMultiple, fmtPct, fmtSignedPct, type SupportedLocale } from "../format";
import {
  TARGET_PNO,
  TARGET_ROAS,
  withMetrics,
  type CampaignChange,
  type CampaignRow,
} from "./types";
import { roas as roasOf } from "@/lib/metrics/ratios";
import { dayOfWeek, weekdayWeightsOf } from "@/lib/metrics/seasonality";
import { sampleVariance } from "@/lib/metrics/config";
import { detectWeeklyRun } from "@/lib/metrics/trends";
import type { DailyPoint as MetricsDailyPoint } from "@/lib/types";

// --- thresholds (single source of truth for "below target" colouring) --------

/** A campaign is bleeding budget when its ROAS falls below this share of the
 *  target. Matches the red ROAS-cell threshold. */
export const ROAS_CRITICAL_RATIO = 0.6;
/** The *equivalent* PNO threshold, derived from ROAS_CRITICAL_RATIO. Because the
 *  target ROAS is exactly 1/target PNO (see targets.ts), PNO ∝ 1/ROAS, so the
 *  reciprocal (1/0.6 ≈ 1.667× the target) makes the red PNO-cell fire at exactly
 *  the same campaign as the red ROAS-cell — they can never disagree. Was a
 *  hand-typed 1.6, which is *not* the reciprocal and left a [1.6×, 1.667×) band
 *  where the PNO cell went red but ROAS/triage stayed neutral. */
export const PNO_CRITICAL_RATIO = 1 / ROAS_CRITICAL_RATIO;

// Change-aware thresholds (sync-over-sync), kept here with the other ratios so the
// alert logic and any prose share one source of truth instead of bare literals.
/** A ROAS "crater": the campaign retained less than this share of its prior ROAS
 *  (i.e. lost more than 40%). */
export const ROAS_CRATER_RETAINED_MAX = 0.6;
/** A "spend spike": period-over-period cost jumped at least this much (+50%)… */
export const SPEND_SPIKE_COST_JUMP = 0.5;
/** …while conversion value grew less than this fraction of the cost jump (lagged). */
export const SPEND_SPIKE_VALUE_LAG = 0.5;

// --- per-metric cell tone (shared with the table cells) ----------------------

/** How a single metric reads against the target: on/above target ("good"),
 *  far enough off to flag red ("bad"), within tolerance ("neutral"), or not
 *  applicable because there is no spend/revenue ("muted"). The table maps these
 *  to colour classes; keeping the decision here means there is one threshold. */
export type MetricTone = "good" | "bad" | "neutral" | "muted";

export function roasMetricTone(roas: number, targetRoas: number = TARGET_ROAS): MetricTone {
  if (roas >= targetRoas) return "good";
  if (roas > 0 && roas < targetRoas * ROAS_CRITICAL_RATIO) return "bad";
  return "neutral";
}

export function pnoMetricTone(pno: number, targetPno: number = TARGET_PNO): MetricTone {
  if (pno <= 0) return "muted";
  if (pno <= targetPno) return "good";
  if (pno >= targetPno * PNO_CRITICAL_RATIO) return "bad";
  return "neutral";
}

// --- severity model ----------------------------------------------------------

export type Severity = "critical" | "warning" | "ok";

/** Highest-severity-first ordering, used for both the badge colour and the
 *  "sort by severity" comparator. */
export const SEVERITY_RANK: Record<Severity, number> = { critical: 2, warning: 1, ok: 0 };

/** Short label for the per-row badge / sort header. */
export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Kritické",
  warning: "Sledovat",
  ok: "V pořádku",
};

export const SEVERITY_LABELS_EN: Record<Severity, string> = {
  critical: "Critical",
  warning: "Watch",
  ok: "On target",
};

export function severityLabel(s: Severity, locale: SupportedLocale): string {
  return (locale === "en" ? SEVERITY_LABELS_EN : SEVERITY_LABELS)[s];
}

export interface TriageReason {
  /** stable rule id (for keys / tests) */
  id: string;
  severity: "critical" | "warning";
  /** short rule name, e.g. "Pozastavená, ale utrácí" */
  label: string;
  /** one line grounded in the campaign's own numbers, for the badge tooltip */
  detail: string;
}

export interface TriageResult {
  severity: Severity;
  /** matched reasons, most-severe first; empty when severity === "ok" */
  reasons: TriageReason[];
  /** the headline reason (most severe, first matched) or null when healthy */
  primary: TriageReason | null;
}

// --- per-tenant goals --------------------------------------------------------
// The rules judge against a target ROAS / PNO. By default these are the module
// constants (the paid-portfolio target), but when a tenant's own goal is known
// — its agreed pnoGoal, and optionally the margin-based break-even from a
// persisted cost model — it is threaded in here so the badge, the cell colour and
// the banner all measure against the SAME per-tenant goal. Absent (or degenerate)
// → the constants, so a default / unseeded tenant stays byte-identical.

export interface TriageGoals {
  /** the tenant's target ROAS = 1 / pnoGoal. */
  targetRoas: number;
  /** the tenant's target PNO (agreed cost share of revenue = pnoGoal). */
  targetPno: number;
  /** the tenant's margin-based break-even ROAS (1 / gross margin) from a persisted
   *  cost model, when one exists. Enables the margin-aware "above target but below
   *  break-even" severity; omitted → that rule never fires (margin-blind, unchanged). */
  breakEvenRoas?: number;
}

/** Resolved, validated goals every rule reads. A missing / degenerate field falls
 *  back to the module constant, so a blank or corrupt profile can never flip a
 *  rule into nonsense and the no-goal path is byte-identical to the pre-goal code. */
interface ResolvedGoals {
  targetRoas: number;
  targetPno: number;
  breakEvenRoas?: number;
}

function resolveGoals(goals?: TriageGoals): ResolvedGoals {
  const targetRoas =
    goals && typeof goals.targetRoas === "number" && goals.targetRoas > 0 ? goals.targetRoas : TARGET_ROAS;
  const targetPno =
    goals && typeof goals.targetPno === "number" && goals.targetPno > 0 ? goals.targetPno : TARGET_PNO;
  const breakEvenRoas =
    goals &&
    typeof goals.breakEvenRoas === "number" &&
    goals.breakEvenRoas > 0 &&
    Number.isFinite(goals.breakEvenRoas)
      ? goals.breakEvenRoas
      : undefined;
  return { targetRoas, targetPno, breakEvenRoas };
}

/** Build TriageGoals from a tenant's agreed pnoGoal (and optional break-even ROAS
 *  from a persisted cost model). The single resolver the tenant-aware call sites
 *  use, so the ROAS + PNO targets always derive from the one pnoGoal. */
export function triageGoals(pnoGoal: number, breakEvenRoas?: number): TriageGoals {
  const pno = typeof pnoGoal === "number" && pnoGoal > 0 ? pnoGoal : TARGET_PNO;
  return { targetPno: pno, targetRoas: 1 / pno, breakEvenRoas };
}

// --- the rules ---------------------------------------------------------------
// Ordered worst-first. ROAS bands are disjoint so a campaign never matches both
// the critical and the warning ROAS rule. New rules (e.g. a drop vs the prior
// window, once that data is wired) slot in here without touching callers.

interface Rule {
  id: string;
  severity: "critical" | "warning";
  label: string;
  labelEn: string;
  test: (c: CampaignRow, g: ResolvedGoals) => boolean;
  detail: (c: CampaignRow, g: ResolvedGoals) => string;
}

const targetLine = (g: ResolvedGoals) => `cíl ${fmtMultiple(g.targetRoas)} (PNO ${fmtPct(g.targetPno, 0)})`;

const RULES: Rule[] = [
  {
    id: "paused_spending",
    severity: "critical",
    label: "Pozastavená, ale utrácí",
    labelEn: "Paused but spending",
    test: (c) => c.status === "paused" && c.cost > 0,
    detail: (c) => `Kampaň je pozastavená, přesto za období utratila ${fmtCZK(c.cost)}.`,
  },
  {
    id: "no_conversions",
    severity: "critical",
    label: "Utrácí bez konverzí",
    labelEn: "Spending without conversions",
    test: (c) => c.cost > 0 && c.conversions === 0,
    detail: (c) => `Žádná konverze při nákladech ${fmtCZK(c.cost)} — rozpočet bez návratnosti.`,
  },
  {
    id: "roas_critical",
    severity: "critical",
    label: "ROAS hluboko pod cílem",
    labelEn: "ROAS far below target",
    test: (c, g) => c.cost > 0 && c.roas > 0 && c.roas < g.targetRoas * ROAS_CRITICAL_RATIO,
    detail: (c, g) =>
      `ROAS ${fmtMultiple(c.roas)} je pod ${fmtPct(ROAS_CRITICAL_RATIO, 0)} cíle; ${targetLine(g)}. PNO ${fmtPct(c.pno)}.`,
  },
  {
    id: "below_target",
    severity: "warning",
    label: "Pod cílem",
    labelEn: "Below target",
    test: (c, g) =>
      c.cost > 0 && c.roas >= g.targetRoas * ROAS_CRITICAL_RATIO && c.roas < g.targetRoas,
    detail: (c, g) => `ROAS ${fmtMultiple(c.roas)} nedosahuje cíle; ${targetLine(g)}. PNO ${fmtPct(c.pno)}.`,
  },
  {
    id: "below_breakeven",
    severity: "warning",
    label: "Nad cílem, ale pod bodem zvratu",
    labelEn: "Above target, below break-even",
    // Margin-aware honesty: a campaign that MEETS the agreed ROAS target can still
    // lose money when the tenant's real gross margin puts break-even ABOVE that
    // target (i.e. pnoGoal > margin). Only fires when a persisted cost model
    // supplied a break-even ROAS; disjoint from the below_target / roas_critical
    // bands (those need roas < target, this needs roas >= target). Margin-blind
    // tenants (no cost model → no breakEvenRoas): never fires, so those stay
    // byte-identical.
    test: (c, g) =>
      g.breakEvenRoas !== undefined &&
      c.cost > 0 &&
      c.roas >= g.targetRoas &&
      c.roas < g.breakEvenRoas,
    detail: (c, g) =>
      `ROAS ${fmtMultiple(c.roas)} plní cíl, ale při vaší marži je bod zvratu ${fmtMultiple(
        g.breakEvenRoas!
      )} — kampaň je při této marži ztrátová.`,
  },
];

// --- change-aware rules (sync-over-sync) -------------------------------------
// These need the diff against the prior sync, so they only fire when a
// CampaignChange is supplied. They catch movement a single-snapshot rule can't:
// a campaign can sit above target yet be cratering toward it.

interface ChangeRule {
  id: string;
  severity: "critical" | "warning";
  label: string;
  labelEn: string;
  test: (c: CampaignRow, ch: CampaignChange, g: ResolvedGoals) => boolean;
  detail: (c: CampaignRow, ch: CampaignChange, g: ResolvedGoals) => string;
}

const CHANGE_RULES: ChangeRule[] = [
  {
    id: "roas_crater",
    severity: "critical",
    label: "Propad ROAS proti minulé synchronizaci",
    labelEn: "ROAS crater vs. last sync",
    // A real collapse: was meaningfully healthy, lost >40% of its ROAS, and has
    // now fallen below target. Guards against tiny-base noise via the before band.
    test: (_c, ch, g) =>
      ch.kind === "changed" &&
      ch.roasBefore >= g.targetRoas * ROAS_CRITICAL_RATIO &&
      ch.roasAfter > 0 &&
      ch.roasAfter < ch.roasBefore * ROAS_CRATER_RETAINED_MAX &&
      ch.roasAfter < g.targetRoas,
    detail: (_c, ch) =>
      `ROAS spadl z ${fmtMultiple(ch.roasBefore)} na ${fmtMultiple(ch.roasAfter)} od minulé synchronizace.`,
  },
  {
    id: "spend_spike",
    severity: "warning",
    label: "Skok nákladů bez návratnosti",
    labelEn: "Spend spike without return",
    // Cost jumped ≥50% while conversion value lagged well behind — efficiency is
    // being diluted even if the absolute ROAS still looks acceptable.
    test: (_c, ch) =>
      ch.kind === "changed" &&
      ch.costDelta >= SPEND_SPIKE_COST_JUMP &&
      ch.valueDelta < ch.costDelta * SPEND_SPIKE_VALUE_LAG,
    detail: (_c, ch) =>
      `Náklady ${fmtSignedPct(ch.costDelta)} proti minulé synchronizaci, hodnota konverzí jen ${fmtSignedPct(ch.valueDelta)}.`,
  },
];

// --- history-aware rule: the slow bleed -------------------------------------
// A single 2-point diff (roas_crater) catches an abrupt collapse, but a campaign
// can also bleed out gradually — a few percent of ROAS lost every week — and
// never trip a step-change rule while it quietly slides below target. This rule
// gives that slow slide a name. It reads ONLY the campaign's existing daily
// series (cost + conversion value per day — the same spine the trend sparkline
// already plots), buckets it into consecutive weeks, and delegates the decline
// verdict to the engine's ONE variance-gated detector (metrics.detectWeeklyRun) —
// the same one detectTrends uses per raw metric. So a weekday-mix artefact can no
// longer masquerade as a bleed (the noise floor swallows it), and a genuine slide
// with a within-noise blip is no longer thrown away by a crude rebound rule. Pure
// trend arithmetic — no fitted model, no new ingestion.

/** Days per weekly bucket. */
export const SLOW_BLEED_WEEK_DAYS = 7;
/** Minimum full weekly buckets required before the rule can fire (≥21 days of
 *  history) — below this it's "insufficient history" and the rule stays silent. */
export const SLOW_BLEED_MIN_WEEKS = 3;
/** Minimum cumulative ROAS loss over the gated decline for the slide to count as a
 *  bleed (−25%). Measured across the run the noise floor actually validated, which
 *  equals the whole window when the slide is clean (so the badge is unchanged where
 *  the crude and gated verdicts agree). */
export const SLOW_BLEED_MIN_DROP = 0.25;
/** Per-move noise threshold, in z units of a weekly-mean difference — the same
 *  bar detectTrends applies. A week-over-week ROAS move must clear this to count
 *  toward the decline, so ordinary weekly wobble can't string together a "bleed". */
export const SLOW_BLEED_Z = 1;

/** The minimal per-day shape the slow-bleed detector needs — a structural subset
 *  of {@link DailyPoint}, so a stored campaign series passes straight through. */
export interface SlowBleedPoint {
  /** YYYY-MM-DD — used only to order the series ascending before bucketing. */
  date: string;
  cost: number;
  conversionValue: number;
}

export interface SlowBleed {
  /** how many consecutive weekly buckets the gated decline spans (run + 1) */
  weeks: number;
  /** ROAS of the bucket just before the decline began (the peak of the slide);
   *  the oldest bucket when the whole window slides */
  roasFrom: number;
  /** ROAS of the most recent weekly bucket */
  roasTo: number;
}

/** Detect a sustained multi-week ROAS decline in a campaign's daily series.
 *  Deterministic, pure, allocation-light. Buckets the series into full weekly
 *  ROAS means (via the shared ratio spine), estimates the per-move noise floor
 *  from the campaign's own de-seasonalised daily ROAS, and delegates the decline
 *  verdict to the engine's ONE variance-gated detector ({@link detectWeeklyRun}).
 *  Returns null (no bleed) for every non-firing shape: insufficient history, a
 *  week with no spend, a flat/volatile series, a slide too shallow to clear the
 *  25% bar, or one whose recent weekly moves are within noise. When it fires,
 *  `weeks` is the length of the declining window for the badge ("ROAS klesá už N
 *  týdnů"). Where the crude and gated verdicts agree (a clean whole-window slide)
 *  the badge is byte-identical; where they differ, the gated verdict wins. */
export function detectSlowBleed(points: readonly SlowBleedPoint[] | undefined): SlowBleed | null {
  if (!points || points.length < SLOW_BLEED_MIN_WEEKS * SLOW_BLEED_WEEK_DAYS) return null;
  // Order ascending by date (stable — the store already returns them ordered, but
  // never trust that) and keep the most recent whole weeks, dropping any leading
  // remainder so every bucket is a full 7 days.
  const asc = [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const weeks = Math.floor(asc.length / SLOW_BLEED_WEEK_DAYS);
  if (weeks < SLOW_BLEED_MIN_WEEKS) return null;
  const used = asc.slice(asc.length - weeks * SLOW_BLEED_WEEK_DAYS);

  // Weekly ROAS via the shared ratio spine: Σvalue / Σcost over each full 7-day
  // bucket (every weekday present once, so the level is already weekday-balanced).
  const roasByWeek: number[] = [];
  for (let w = 0; w < weeks; w++) {
    let cost = 0;
    let value = 0;
    for (let i = 0; i < SLOW_BLEED_WEEK_DAYS; i++) {
      const p = used[w * SLOW_BLEED_WEEK_DAYS + i]!;
      cost += Number(p.cost) || 0;
      value += Number(p.conversionValue) || 0;
    }
    // A week with no spend has no defined ROAS — the trend is ambiguous, so we
    // decline to call it a bleed rather than guess.
    if (cost <= 0) return null;
    roasByWeek.push(roasOf(value, cost));
  }
  if (roasByWeek[0]! <= 0) return null;

  // Bridge the campaign series into the dashboard's daily shape (mirroring
  // anomaly-alerts' toMetricSeries) so the shared de-seasonalisation + variance
  // helpers estimate the per-move noise floor from the campaign's own daily ROAS,
  // exactly as detectTrends does per raw metric. This is what turns the crude
  // "−25% with a 5% rebound tolerance" rule into the engine's one gated detector.
  const bridged: MetricsDailyPoint[] = used.map((p) => ({
    date: p.date,
    visits: 0,
    cost: Number(p.cost) || 0,
    conversions: 0,
    revenue: Number(p.conversionValue) || 0,
  }));
  const dayRoas = (p: MetricsDailyPoint) => roasOf(p.revenue, p.cost);
  const weights = weekdayWeightsOf(bridged, dayRoas);
  const adj = bridged.map((p) => {
    const w = weights[dayOfWeek(p.date)] || 1;
    return dayRoas(p) / (w > 0 ? w : 1);
  });
  const seMove = Math.sqrt((2 * sampleVariance(adj)) / SLOW_BLEED_WEEK_DAYS);

  // A run of (MIN_WEEKS − 1) same-direction weekly moves spans MIN_WEEKS buckets.
  const found = detectWeeklyRun(roasByWeek, seMove, SLOW_BLEED_MIN_WEEKS - 1, SLOW_BLEED_Z);
  if (!found || found.direction !== "down") return null;
  // Still require a materially deep slide over the gated run (unchanged −25% bar),
  // so a shallow-but-significant wobble doesn't earn the "bleed" badge.
  if (found.cumulativeChange > -SLOW_BLEED_MIN_DROP) return null;
  // `weeks` counts the declining BUCKETS (run + 1); for a clean whole-window slide
  // the base is the oldest bucket, so the count and endpoints match the crude rule.
  return { weeks: found.run + 1, roasFrom: found.base, roasTo: found.last };
}

/** English label lookup keyed by rule id — used by the locale resolver. The
 *  history-aware slow-bleed reason isn't in the static rule arrays (it needs the
 *  daily series), so its label is registered here alongside them. */
const RULE_LABEL_EN: Record<string, string> = {
  ...Object.fromEntries([...RULES, ...CHANGE_RULES].map((r) => [r.id, r.labelEn])),
  slow_bleed: "Slow ROAS bleed",
};

/** Resolve a triage-reason label in the requested locale. Falls back to the
 *  Czech `label` stored on the reason when no EN mapping exists. */
export function triageReasonLabel(reason: TriageReason, locale: SupportedLocale): string {
  if (locale === "en") return RULE_LABEL_EN[reason.id] ?? reason.label;
  return reason.label;
}

/** Classify one campaign against every rule. When a `change` (the diff against
 *  the prior sync) is supplied, the sync-over-sync rules also run, so a ROAS
 *  crater or an unbacked spend spike earns a badge a snapshot rule would miss.
 *  When `goals` is supplied (the tenant's agreed pnoGoal → target ROAS, and
 *  optionally the margin-based break-even), every rule judges against that
 *  per-tenant goal instead of the module constants; omitted → the constants, so
 *  a default / unseeded tenant is byte-identical.
 *
 *  When `history` (the campaign's daily cost/value series) is supplied, the
 *  history-aware slow-bleed rule also runs — a sustained multi-week ROAS decline
 *  earns a warning a two-point diff can't see. Omitted → that rule can't fire, so
 *  callers without a series stay byte-identical. */
export function triage(
  c: CampaignRow,
  change?: CampaignChange,
  goals?: TriageGoals,
  history?: readonly SlowBleedPoint[]
): TriageResult {
  const g = resolveGoals(goals);
  const reasons: TriageReason[] = RULES.filter((r) => r.test(c, g)).map((r) => ({
    id: r.id,
    severity: r.severity,
    label: r.label,
    detail: r.detail(c, g),
  }));
  if (change) {
    for (const r of CHANGE_RULES) {
      if (r.test(c, change, g)) {
        reasons.push({ id: r.id, severity: r.severity, label: r.label, detail: r.detail(c, change, g) });
      }
    }
  }
  if (history) {
    const bleed = detectSlowBleed(history);
    if (bleed) {
      reasons.push({
        id: "slow_bleed",
        severity: "warning",
        label: "Pozvolný pokles ROAS",
        // "posledních N týdnů" — genitive plural is grammatical for every N here.
        detail: `ROAS klesá už posledních ${bleed.weeks} týdnů — z ${fmtMultiple(
          bleed.roasFrom
        )} na ${fmtMultiple(bleed.roasTo)}.`,
      });
    }
  }
  reasons.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  const severity: Severity = reasons.some((r) => r.severity === "critical")
    ? "critical"
    : reasons.length > 0
      ? "warning"
      : "ok";
  return { severity, reasons, primary: reasons[0] ?? null };
}

/** Sort weight: criticals above warnings above healthy, then by spend so the
 *  most expensive problem floats to the top — the order in which a PPC manager
 *  should spend their attention (and their AI-evaluation clicks). When the
 *  sync-over-sync `change` is supplied, the change-aware rules count too, so a
 *  ROAS crater ranks with the criticals it is. */
export function triageWeight(
  c: CampaignRow,
  change?: CampaignChange,
  goals?: TriageGoals,
  history?: readonly SlowBleedPoint[]
): number {
  return SEVERITY_RANK[triage(c, change, goals, history).severity] * 1e12 + c.cost;
}

// --- portfolio summary (the banner headline) ---------------------------------

export interface TriageSummary {
  critical: number;
  warning: number;
  /** critical + warning — the "vyžaduje pozornost" count */
  attention: number;
  ok: number;
  total: number;
}

export function summarize(
  rows: CampaignRow[],
  changesById?: Record<string, CampaignChange>,
  goals?: TriageGoals,
  historyById?: Record<string, readonly SlowBleedPoint[]>
): TriageSummary {
  const s: TriageSummary = { critical: 0, warning: 0, attention: 0, ok: 0, total: rows.length };
  for (const r of rows) {
    const sev = triage(r, changesById?.[r.id], goals, historyById?.[r.id]).severity;
    if (sev === "critical") s.critical++;
    else if (sev === "warning") s.warning++;
    else s.ok++;
  }
  s.attention = s.critical + s.warning;
  return s;
}

// --- historic snapshot triage (the portfolio-health timeline) -----------------

/** The per-campaign fields every stored sync snapshot carries — sufficient to
 *  evaluate all four snapshot rules (status / cost / conversions, with ROAS and
 *  PNO re-derived from cost and conversion value). */
export interface SnapshotTriageEntry {
  status: string;
  cost: number;
  conversions: number;
  conversionValue: number;
}

/** One stored sync, triaged: when it happened + how the portfolio scored then. */
export interface SnapshotSummaryPoint {
  /** ISO timestamp of the sync the snapshot belongs to */
  syncedAt: string;
  summary: TriageSummary;
}

/** Run the snapshot triage rules over one stored sync snapshot and roll the
 *  severities up into the same TriageSummary the live banner shows — the
 *  deterministic, free counterpart of the AI score timeline ("are we trending
 *  healthier?" answered on every sync, not only when someone pays for an
 *  evaluation). The change-aware rules need a diff and deliberately don't run
 *  here: each historic point stands alone. Funnel fields the snapshot doesn't
 *  store (impressions/clicks) are zeroed — no rule reads them. */
export function summarizeSnapshotEntries(
  entries: SnapshotTriageEntry[],
  goals?: TriageGoals
): TriageSummary {
  return summarize(
    entries.map((e, i) =>
      withMetrics({
        id: String(i),
        name: "",
        type: "search",
        status: e.status === "paused" ? "paused" : "enabled",
        impressions: 0,
        clicks: 0,
        cost: Number(e.cost) || 0,
        conversions: Number(e.conversions) || 0,
        conversionValue: Number(e.conversionValue) || 0,
      })
    ),
    undefined,
    goals
  );
}
