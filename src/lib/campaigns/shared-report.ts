/** Client-shareable report: snapshot the portfolio AI evaluation + campaigns into
 *  a read-only doc behind an unguessable token, so a user can hand a client a link.
 *  Server-only. */
import { randomBytes } from "node:crypto";
import { firestore } from "@/lib/firebase";
import type { CampaignReport, ReportHistoryPoint } from "../ai-types";
import type { Campaign } from "./types";
import {
  getReportHistory,
  getReportsForPeriod,
  getSyncMeta,
  listCampaigns,
} from "./store";

export interface SharedReport {
  accountName: string;
  period: string;
  createdAt: string;
  report: CampaignReport;
  history: ReportHistoryPoint[];
  campaigns: Campaign[];
}

/** Create a shareable snapshot of the tenant's current portfolio evaluation.
 *  Returns the token, or null when there's no portfolio report yet. */
export async function createSharedReport(
  tenant: string,
  accountName: string
): Promise<string | null> {
  const meta = await getSyncMeta(tenant);
  if (!meta) return null;

  const report = (await getReportsForPeriod(tenant, meta.period))["overall"];
  if (!report) return null;

  const shared: SharedReport = {
    accountName,
    period: meta.period,
    createdAt: new Date().toISOString(),
    report,
    history: await getReportHistory(tenant, "overall", null),
    campaigns: await listCampaigns(tenant),
  };

  const token = randomBytes(16).toString("hex");
  await firestore.collection("sharedReports").doc(token).set(shared);
  return token;
}

export async function getSharedReport(token: string): Promise<SharedReport | null> {
  const doc = await firestore.collection("sharedReports").doc(token).get();
  return doc.exists ? (doc.data() as SharedReport) : null;
}
