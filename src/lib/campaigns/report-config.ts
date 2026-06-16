/** Per-tenant client-report configuration (white-label + scheduled delivery).
 *  Stored at `tenants/{tenant}/config/report`. Drives the branded report page and
 *  the daily report cron. Server-only — the pure shapes/constants live in
 *  `report-config-types.ts` so the client UI can import them firebase-free. */
import { firestore } from "@/lib/firebase";
import { REPORT_CADENCES, type ReportCadence, type ReportConfig } from "./report-config-types";

export {
  REPORT_CADENCES,
  REPORT_CADENCE_LABELS,
  DEFAULT_REPORT_CONFIG,
} from "./report-config-types";
export type { ReportCadence, ReportConfig } from "./report-config-types";

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
    lastSentDay: d.lastSentDay,
  };
}

/** Persist the editable fields (cadence/branding/recipients), leaving the
 *  cron-managed `lastSentDay` untouched. */
export async function setReportConfig(
  tenant: string,
  patch: Pick<ReportConfig, "brandName" | "accentColor" | "recipients" | "cadence">
): Promise<void> {
  await configRef(tenant).set(patch, { merge: true });
}

/** Cron-side: record that a scheduled report went out today. */
export async function markReportSent(tenant: string, day: string): Promise<void> {
  await configRef(tenant).set({ lastSentDay: day }, { merge: true });
}
