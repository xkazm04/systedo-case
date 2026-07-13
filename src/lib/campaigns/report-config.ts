/** Per-tenant client-report configuration (white-label + scheduled delivery).
 *  Stored at `tenants/{tenant}/config/report`. Drives the branded report page and
 *  the daily report cron. Server-only — the pure shapes/constants live in
 *  `report-config-types.ts` so the client UI can import them firebase-free. */
import { firestore } from "@/lib/firebase";
import {
  DEFAULT_CLIENT_PROFILE,
  REPORT_CADENCES,
  type ClientProfile,
  type ReportCadence,
  type ReportConfig,
} from "./report-config-types";

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
  };
}

/** Persist the editable fields (cadence/branding/recipients/client profile),
 *  leaving the cron-managed `lastSentDay` untouched. */
export async function setReportConfig(
  tenant: string,
  patch: Pick<ReportConfig, "brandName" | "accentColor" | "recipients" | "cadence" | "clientProfile">
): Promise<void> {
  await configRef(tenant).set(patch, { merge: true });
}

/** Cron-side: record that a scheduled report went out today. */
export async function markReportSent(tenant: string, day: string): Promise<void> {
  await configRef(tenant).set({ lastSentDay: day }, { merge: true });
}
