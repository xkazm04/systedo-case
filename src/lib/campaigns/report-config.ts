/** Per-tenant client-report configuration (white-label + scheduled delivery) —
 *  backend dispatcher. Local node:sqlite when LOCAL_DB is on, else Firestore;
 *  the backend is imported LAZILY so the LOCAL_DB path never evaluates the
 *  Firestore module (mirrors goals/store.ts, cron/sent-guard.ts). Stored at
 *  `tenants/{tenant}/config/report` on the Firestore side. Drives the branded
 *  report page and the daily report cron. Server-only — the pure
 *  shapes/constants live in `report-config-types.ts` so the client UI can
 *  import them firebase-free. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import {
  DEFAULT_CLIENT_PROFILE,
  REPORT_CADENCES,
  type ClientProfile,
  type ReportCadence,
  type ReportConfig,
} from "./report-config-types";
import { recordGoalChange, sanitizeGoalHistory, type GoalChange } from "@/lib/metrics/goal-history";

export {
  REPORT_CADENCES,
  REPORT_CADENCE_LABELS,
  DEFAULT_REPORT_CONFIG,
  DEFAULT_CLIENT_PROFILE,
} from "./report-config-types";
export type { ReportCadence, ReportConfig, ClientProfile } from "./report-config-types";

function backend() {
  return LOCAL_DB ? import("./report-config.local") : import("./report-config.firestore");
}

/** Fill any missing client-profile field from the default (Mionelo) so an
 *  unseeded tenant renders the demo unchanged and a partial doc never yields
 *  undefined name/goal. */
function resolveClientProfile(raw: Partial<ClientProfile> | undefined): ClientProfile {
  return {
    name: typeof raw?.name === "string" && raw.name ? raw.name : DEFAULT_CLIENT_PROFILE.name,
    domain: typeof raw?.domain === "string" && raw.domain ? raw.domain : DEFAULT_CLIENT_PROFILE.domain,
    businessLine:
      typeof raw?.businessLine === "string" && raw.businessLine
        ? raw.businessLine
        : DEFAULT_CLIENT_PROFILE.businessLine,
    pnoGoal:
      typeof raw?.pnoGoal === "number" && raw.pnoGoal > 0 ? raw.pnoGoal : DEFAULT_CLIENT_PROFILE.pnoGoal,
  };
}

/** The tenant's client profile — the single source for prompt identity + PNO
 *  goal. A thin read used by the AI report path and anomaly goal-breaches. */
export async function getClientProfile(tenant: string): Promise<ClientProfile> {
  return (await getReportConfig(tenant)).clientProfile;
}

export async function getReportConfig(tenant: string): Promise<ReportConfig> {
  const d = (await (await backend()).readConfig(tenant)) ?? {};
  return {
    brandName: d.brandName ?? "",
    accentColor: d.accentColor ?? "",
    recipients: Array.isArray(d.recipients) ? d.recipients : [],
    cadence: REPORT_CADENCES.includes(d.cadence as ReportCadence) ? (d.cadence as ReportCadence) : "off",
    clientProfile: resolveClientProfile(d.clientProfile),
    lastSentDay: d.lastSentDay,
    // Normalise the stored goal-change memory (drop malformed entries, sort, dedup);
    // absent → [] so consumers never branch on undefined.
    revenueGoalHistory: sanitizeGoalHistory(d.revenueGoalHistory),
  };
}

/** Record a change to the monthly REVENUE goal, effective from `effectiveMonth`
 *  (YYYY-MM). Idempotent BY VALUE: a save that repeats the goal already in force for
 *  that month writes nothing (the pure `recordGoalChange` returns the list
 *  unchanged, and an equal-length list is a no-op merge), so repeated saves never
 *  grow the log. The seam a monthly-goal editor calls; `monthlyAttainmentHistory`
 *  then scores each past month against the goal in force that month. */
export async function recordRevenueGoal(
  tenant: string,
  effectiveMonth: string,
  goal: number
): Promise<GoalChange[]> {
  const current = (await getReportConfig(tenant)).revenueGoalHistory ?? [];
  const next = recordGoalChange(current, effectiveMonth, goal);
  if (next.length === current.length && next.every((e, i) => e.effectiveMonth === current[i].effectiveMonth && e.goal === current[i].goal)) {
    return current; // no-op: same value already in force (idempotent)
  }
  await (await backend()).writeConfig(tenant, { revenueGoalHistory: next });
  return next;
}

/** Persist the editable fields (cadence/branding/recipients/client profile),
 *  leaving the cron-managed `lastSentDay` untouched. */
export async function setReportConfig(
  tenant: string,
  patch: Pick<ReportConfig, "brandName" | "accentColor" | "recipients" | "cadence" | "clientProfile">
): Promise<void> {
  await (await backend()).writeConfig(tenant, patch);
}

/** Pure claim decision: is `day` already the recorded sent-day? The atomic claim
 *  below turns on this comparison; exported so the (untestable-without-a-backend)
 *  decision is unit-tested in isolation. */
export function isDayClaimed(lastSentDay: string | undefined, day: string): boolean {
  return lastSentDay === day;
}

/** Cron-side, CLAIM-FIRST: atomically claim `day` as sent BEFORE the report is
 *  built/emailed, so two overlapping daily runs can't both pass the due-check and
 *  double-send. Returns true only to the caller that won the claim; a run that
 *  finds the day already claimed returns false and skips. Release with
 *  releaseReportDay on a TOTAL delivery failure so the next run retries the
 *  whole batch. */
export async function claimReportDay(tenant: string, day: string): Promise<boolean> {
  return (await backend()).claimDay(tenant, day);
}

/** Release a claim taken by claimReportDay when nothing was delivered (total
 *  failure / no evaluation), so the next run of the same day retries instead of
 *  the day staying silently "sent". Only clears OUR claim: a no-op if lastSentDay
 *  has since moved on. */
export async function releaseReportDay(tenant: string, day: string): Promise<void> {
  return (await backend()).releaseDay(tenant, day);
}
