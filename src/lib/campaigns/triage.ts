/** Rule-based triage for the campaign portfolio — the "what needs attention now"
 *  layer that turns raw metrics into Google-Ads / Optmyzr-style alerts. Pure: no
 *  React, no Tailwind, no DB, so it is shared by the table cells, the per-row
 *  badges and the summary banner. The thresholds reuse the same agreed target
 *  constants that colour the ROAS / PNO cells, so the badge, the cell colour and
 *  the banner can never disagree. */
import { fmtCZK, fmtMultiple, fmtPct } from "../format";
import { TARGET_PNO, TARGET_ROAS, type CampaignRow } from "./types";

// --- thresholds (single source of truth for "below target" colouring) --------

/** A campaign is bleeding budget when its ROAS falls below this share of the
 *  target (≈ PNO 1.67× the target). Matches the red ROAS-cell threshold. */
export const ROAS_CRITICAL_RATIO = 0.6;
/** …or equivalently when PNO climbs to this multiple of the target. Matches the
 *  red PNO-cell threshold. */
export const PNO_CRITICAL_RATIO = 1.6;

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
  test: (c: CampaignRow) => boolean;
  detail: (c: CampaignRow) => string;
}

const TARGET_LINE = `cíl ${fmtMultiple(TARGET_ROAS)} (PNO ${fmtPct(TARGET_PNO, 0)})`;

const RULES: Rule[] = [
  {
    id: "paused_spending",
    severity: "critical",
    label: "Pozastavená, ale utrácí",
    test: (c) => c.status === "paused" && c.cost > 0,
    detail: (c) => `Kampaň je pozastavená, přesto za období utratila ${fmtCZK(c.cost)}.`,
  },
  {
    id: "no_conversions",
    severity: "critical",
    label: "Utrácí bez konverzí",
    test: (c) => c.cost > 0 && c.conversions === 0,
    detail: (c) => `Žádná konverze při nákladech ${fmtCZK(c.cost)} — rozpočet bez návratnosti.`,
  },
  {
    id: "roas_critical",
    severity: "critical",
    label: "ROAS hluboko pod cílem",
    test: (c) => c.cost > 0 && c.roas > 0 && c.roas < TARGET_ROAS * ROAS_CRITICAL_RATIO,
    detail: (c) =>
      `ROAS ${fmtMultiple(c.roas)} je pod 60 % cíle; ${TARGET_LINE}. PNO ${fmtPct(c.pno)}.`,
  },
  {
    id: "below_target",
    severity: "warning",
    label: "Pod cílem",
    test: (c) =>
      c.cost > 0 && c.roas >= TARGET_ROAS * ROAS_CRITICAL_RATIO && c.roas < TARGET_ROAS,
    detail: (c) => `ROAS ${fmtMultiple(c.roas)} nedosahuje cíle; ${TARGET_LINE}. PNO ${fmtPct(c.pno)}.`,
  },
];

/** Classify one campaign against every rule. */
export function triage(c: CampaignRow): TriageResult {
  const reasons: TriageReason[] = RULES.filter((r) => r.test(c)).map((r) => ({
    id: r.id,
    severity: r.severity,
    label: r.label,
    detail: r.detail(c),
  }));
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

export function summarize(rows: CampaignRow[]): TriageSummary {
  const s: TriageSummary = { critical: 0, warning: 0, attention: 0, ok: 0, total: rows.length };
  for (const r of rows) {
    const sev = triage(r).severity;
    if (sev === "critical") s.critical++;
    else if (sev === "warning") s.warning++;
    else s.ok++;
  }
  s.attention = s.critical + s.warning;
  return s;
}
