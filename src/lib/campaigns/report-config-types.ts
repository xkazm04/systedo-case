/** Pure report-config shapes + constants — no I/O, no firebase. Split out of
 *  `report-config.ts` so the client settings UI can import the cadence list and
 *  types without pulling firebase-admin into the browser bundle. */
import { PAID_PORTFOLIO_TARGET_PNO } from "@/lib/targets";
import type { GoalChange } from "@/lib/metrics/goal-history";

export type { GoalChange } from "@/lib/metrics/goal-history";

export type ReportCadence = "off" | "weekly" | "monthly";
export const REPORT_CADENCES: ReportCadence[] = ["off", "weekly", "monthly"];

/** Per-tenant client identity + goal — the ONE source that grounds the AI report
 *  prompt (who the client is) and the single PNO target every surface measures
 *  against. Replaces the client string that was hardcoded in the report prompt
 *  and the rogue 0.15 anomaly goal that split-brained against the 0.18 target. */
export interface ClientProfile {
  /** client / brand name shown in the AI report prompt (e.g. "Mionelo") */
  name: string;
  /** client domain (e.g. "mionelo.cz") */
  domain: string;
  /** one-line business description that frames the portfolio for the model */
  businessLine: string;
  /** the client's agreed PNO goal (share of revenue spent on ads); the single
   *  target report-input, anomaly goal-breaches and triage all resolve from */
  pnoGoal: number;
}

/** Default profile = the case-study client (Mionelo), so sample/unseeded tenants
 *  render exactly the demo they always did, and `pnoGoal` traces to the one paid-
 *  portfolio target constant (0.18) rather than a second hardcoded number. */
export const DEFAULT_CLIENT_PROFILE: ClientProfile = {
  name: "Mionelo",
  domain: "mionelo.cz",
  businessLine: "e-shop s ořechy, semínky a superpotravinami",
  pnoGoal: PAID_PORTFOLIO_TARGET_PNO,
};

export const REPORT_CADENCE_LABELS: Record<ReportCadence, string> = {
  off: "Vypnuto",
  weekly: "Týdně (pondělí)",
  monthly: "Měsíčně (1. den)",
};

export interface ReportConfig {
  /** white-label brand name shown on the report (empty = account name) */
  brandName: string;
  /** accent colour (hex) for the report header (empty = default brand) */
  accentColor: string;
  /** who the scheduled report is emailed to (empty = the account owner) */
  recipients: string[];
  cadence: ReportCadence;
  /** the tenant's client identity + PNO goal (see ClientProfile) */
  clientProfile: ClientProfile;
  /** UTC day (YYYY-MM-DD) a scheduled report was last sent — double-send guard */
  lastSentDay?: string;
  /** append-only memory of the monthly REVENUE goal — each `{ effectiveMonth, goal }`
   *  records the goal that took effect that YYYY-MM. Additive & optional: absent (the
   *  default) means "no changes recorded", so `monthlyAttainmentHistory` scores every
   *  month against the current constant goal exactly as before. Written idempotently
   *  by `recordRevenueGoal`; the pure timeline logic lives in metrics/goal-history. */
  revenueGoalHistory?: GoalChange[];
}

export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  brandName: "",
  accentColor: "",
  recipients: [],
  cadence: "off",
  clientProfile: DEFAULT_CLIENT_PROFILE,
};
