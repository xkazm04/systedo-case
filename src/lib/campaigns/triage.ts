/** Rule-based triage for the campaign portfolio — the "what needs attention now"
 *  layer that turns raw metrics into Google-Ads / Optmyzr-style alerts. Pure: no
 *  React, no Tailwind, no DB, so it is shared by the table cells, the per-row
 *  badges and the summary banner. The thresholds reuse the same agreed target
 *  constants that colour the ROAS / PNO cells, so the badge, the cell colour and
 *  the banner can never disagree. */
import { fmtCZK, fmtMultiple, fmtPct, fmtSignedPct, type SupportedLocale } from "../format";
import { TARGET_PNO, TARGET_ROAS, type CampaignChange, type CampaignRow } from "./types";

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

export function roasMetricTone(roas: number): MetricTone {
  if (roas >= TARGET_ROAS) return "good";
  if (roas > 0 && roas < TARGET_ROAS * ROAS_CRITICAL_RATIO) return "bad";
  return "neutral";
}

export function pnoMetricTone(pno: number): MetricTone {
  if (pno <= 0) return "muted";
  if (pno <= TARGET_PNO) return "good";
  if (pno >= TARGET_PNO * PNO_CRITICAL_RATIO) return "bad";
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

// --- the rules ---------------------------------------------------------------
// Ordered worst-first. ROAS bands are disjoint so a campaign never matches both
// the critical and the warning ROAS rule. New rules (e.g. a drop vs the prior
// window, once that data is wired) slot in here without touching callers.

interface Rule {
  id: string;
  severity: "critical" | "warning";
  label: string;
  labelEn: string;
  test: (c: CampaignRow) => boolean;
  detail: (c: CampaignRow) => string;
}

const TARGET_LINE = `cíl ${fmtMultiple(TARGET_ROAS)} (PNO ${fmtPct(TARGET_PNO, 0)})`;

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
    test: (c) => c.cost > 0 && c.roas > 0 && c.roas < TARGET_ROAS * ROAS_CRITICAL_RATIO,
    detail: (c) =>
      `ROAS ${fmtMultiple(c.roas)} je pod ${fmtPct(ROAS_CRITICAL_RATIO, 0)} cíle; ${TARGET_LINE}. PNO ${fmtPct(c.pno)}.`,
  },
  {
    id: "below_target",
    severity: "warning",
    label: "Pod cílem",
    labelEn: "Below target",
    test: (c) =>
      c.cost > 0 && c.roas >= TARGET_ROAS * ROAS_CRITICAL_RATIO && c.roas < TARGET_ROAS,
    detail: (c) => `ROAS ${fmtMultiple(c.roas)} nedosahuje cíle; ${TARGET_LINE}. PNO ${fmtPct(c.pno)}.`,
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
  test: (c: CampaignRow, ch: CampaignChange) => boolean;
  detail: (c: CampaignRow, ch: CampaignChange) => string;
}

const CHANGE_RULES: ChangeRule[] = [
  {
    id: "roas_crater",
    severity: "critical",
    label: "Propad ROAS proti minulé synchronizaci",
    labelEn: "ROAS crater vs. last sync",
    // A real collapse: was meaningfully healthy, lost >40% of its ROAS, and has
    // now fallen below target. Guards against tiny-base noise via the before band.
    test: (_c, ch) =>
      ch.kind === "changed" &&
      ch.roasBefore >= TARGET_ROAS * ROAS_CRITICAL_RATIO &&
      ch.roasAfter > 0 &&
      ch.roasAfter < ch.roasBefore * ROAS_CRATER_RETAINED_MAX &&
      ch.roasAfter < TARGET_ROAS,
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

/** English label lookup keyed by rule id — used by the locale resolver. */
const RULE_LABEL_EN: Record<string, string> = Object.fromEntries(
  [...RULES, ...CHANGE_RULES].map((r) => [r.id, r.labelEn])
);

/** Resolve a triage-reason label in the requested locale. Falls back to the
 *  Czech `label` stored on the reason when no EN mapping exists. */
export function triageReasonLabel(reason: TriageReason, locale: SupportedLocale): string {
  if (locale === "en") return RULE_LABEL_EN[reason.id] ?? reason.label;
  return reason.label;
}

/** Classify one campaign against every rule. When a `change` (the diff against
 *  the prior sync) is supplied, the sync-over-sync rules also run, so a ROAS
 *  crater or an unbacked spend spike earns a badge a snapshot rule would miss. */
export function triage(c: CampaignRow, change?: CampaignChange): TriageResult {
  const reasons: TriageReason[] = RULES.filter((r) => r.test(c)).map((r) => ({
    id: r.id,
    severity: r.severity,
    label: r.label,
    detail: r.detail(c),
  }));
  if (change) {
    for (const r of CHANGE_RULES) {
      if (r.test(c, change)) {
        reasons.push({ id: r.id, severity: r.severity, label: r.label, detail: r.detail(c, change) });
      }
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
 *  should spend their attention (and their AI-evaluation clicks). */
export function triageWeight(c: CampaignRow): number {
  return SEVERITY_RANK[triage(c).severity] * 1e12 + c.cost;
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
  changesById?: Record<string, CampaignChange>
): TriageSummary {
  const s: TriageSummary = { critical: 0, warning: 0, attention: 0, ok: 0, total: rows.length };
  for (const r of rows) {
    const sev = triage(r, changesById?.[r.id]).severity;
    if (sev === "critical") s.critical++;
    else if (sev === "warning") s.warning++;
    else s.ok++;
  }
  s.attention = s.critical + s.warning;
  return s;
}
