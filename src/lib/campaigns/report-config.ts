/** Per-tenant client-report configuration (white-label + scheduled delivery).
 *  Stored at `tenants/{tenant}/config/report`. Drives the branded report page and
 *  the daily report cron. Server-only — the pure shapes/constants live in
 *  `report-config-types.ts` so the client UI can import them firebase-free. */
import { firestore } from "@/lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
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

function configRef(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("config").doc("report");
}

export async function getReportConfig(tenant: string): Promise<ReportConfig> {
  const doc = await configRef(tenant).get();
  const d = (doc.data() as Partial<ReportConfig>) ?? {};
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
 *  then scores each past month against the goal in force that month. Firestore-only,
 *  matching the rest of this store. */
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
  await configRef(tenant).set({ revenueGoalHistory: next }, { merge: true });
  return next;
}

/** Persist the editable fields (cadence/branding/recipients/client profile),
 *  leaving the cron-managed `lastSentDay` untouched. */
export async function setReportConfig(
  tenant: string,
  patch: Pick<ReportConfig, "brandName" | "accentColor" | "recipients" | "cadence" | "clientProfile">
): Promise<void> {
  await configRef(tenant).set(patch, { merge: true });
}

/** Pure claim decision: is `day` already the recorded sent-day? The atomic claim
 *  below turns on this comparison; exported so the (untestable-without-Firestore)
 *  transaction's decision is unit-tested in isolation. */
export function isDayClaimed(lastSentDay: string | undefined, day: string): boolean {
  return lastSentDay === day;
}

/** Cron-side, CLAIM-FIRST: atomically claim `day` as sent BEFORE the report is
 *  built/emailed, so two overlapping daily runs can't both pass the due-check and
 *  double-send. Returns true only to the caller that won the claim; a run that
 *  finds the day already claimed returns false and skips. Firestore transaction =
 *  the atomic compare-and-set (report-config is Firestore-only; the cron reads it
 *  the same way). Release with releaseReportDay on a TOTAL delivery failure so the
 *  next run retries the whole batch. */
export async function claimReportDay(tenant: string, day: string): Promise<boolean> {
  const ref = configRef(tenant);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const lastSentDay = (snap.data() as Partial<ReportConfig> | undefined)?.lastSentDay;
    if (isDayClaimed(lastSentDay, day)) return false; // already claimed this day
    tx.set(ref, { lastSentDay: day }, { merge: true });
    return true;
  });
}

/** Release a claim taken by claimReportDay when nothing was delivered (total
 *  failure / no evaluation), so the next run of the same day retries instead of
 *  the day staying silently "sent". Only clears OUR claim: a no-op if lastSentDay
 *  has since moved on. */
export async function releaseReportDay(tenant: string, day: string): Promise<void> {
  const ref = configRef(tenant);
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const lastSentDay = (snap.data() as Partial<ReportConfig> | undefined)?.lastSentDay;
    if (isDayClaimed(lastSentDay, day)) {
      tx.set(ref, { lastSentDay: FieldValue.delete() }, { merge: true });
    }
  });
}
