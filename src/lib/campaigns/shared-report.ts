/** Client-shareable report: snapshot the portfolio AI evaluation + campaigns into
 *  a read-only doc behind an unguessable token, so a user can hand a client a link.
 *  Links carry a TTL (auto-expire), count views, and can be listed + revoked by the
 *  tenant that created them — so a handed-out link is never an indefinite,
 *  unrevocable data exposure. Server-only. */
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase";
import type { CampaignReport, ReportHistoryPoint } from "../ai-types";
import type { Campaign, DailyPoint } from "./types";
import {
  getReportHistory,
  getReportsForPeriod,
  getSeries,
  getSyncMeta,
  listCampaigns,
} from "./store";
import { getReportConfig } from "./report-config";

/** How long a freshly-created share link stays live. */
export const SHARE_TTL_DAYS = 30;

export interface SharedReport {
  /** the tenant that owns the link (so only its creator can list/revoke it) */
  tenant: string;
  accountName: string;
  period: string;
  createdAt: string;
  /** ISO timestamp after which the link 404s */
  expiresAt: string;
  /** how many times the public page has been opened */
  views: number;
  /** white-label branding captured at creation (optional) */
  brandName?: string;
  accentColor?: string;
  /** client/white-label logo captured at share time, rendered on the client page */
  logoUrl?: string;
  report: CampaignReport;
  history: ReportHistoryPoint[];
  campaigns: Campaign[];
  /** daily portfolio series for the report trend chart */
  series: DailyPoint[];
}

/** Lightweight row for the "my shared links" management list (no heavy payload). */
export interface SharedReportSummary {
  token: string;
  accountName: string;
  period: string;
  createdAt: string;
  expiresAt: string;
  views: number;
  expired: boolean;
}

function collection() {
  return firestore.collection("sharedReports");
}

function isExpired(expiresAt: string | undefined): boolean {
  return Boolean(expiresAt) && new Date(expiresAt!).getTime() < Date.now();
}

/** Create a shareable snapshot of the tenant's current portfolio evaluation.
 *  Returns the token, or null when there's no portfolio report yet.
 *
 *  `brandFallback` (the active project's name/accent) is used when no white-label
 *  is configured, so a client-facing report carries the CLIENT's brand — never
 *  the vendor name — by default. */
export async function createSharedReport(
  tenant: string,
  accountName: string,
  brandFallback?: { name?: string; accent?: string; logo?: string }
): Promise<string | null> {
  const meta = await getSyncMeta(tenant);
  if (!meta) return null;

  const report = (await getReportsForPeriod(tenant, meta.period))["overall"];
  if (!report) return null;

  const config = await getReportConfig(tenant);
  const now = Date.now();
  const shared: SharedReport = {
    tenant,
    accountName,
    period: meta.period,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SHARE_TTL_DAYS * 86_400_000).toISOString(),
    views: 0,
    brandName: config.brandName || brandFallback?.name || undefined,
    accentColor: config.accentColor || brandFallback?.accent || undefined,
    logoUrl: brandFallback?.logo || undefined,
    report,
    history: await getReportHistory(tenant, "overall", null),
    campaigns: await listCampaigns(tenant),
    series: await getSeries(tenant),
  };

  const token = randomBytes(16).toString("hex");
  await collection().doc(token).set(shared);
  return token;
}

/** Fetch a shared report for the public page. Returns null when missing or expired,
 *  and best-effort counts the view. */
export async function getSharedReport(token: string): Promise<SharedReport | null> {
  const ref = collection().doc(token);
  const doc = await ref.get();
  if (!doc.exists) return null;
  const data = doc.data() as SharedReport;
  if (isExpired(data.expiresAt)) return null;

  // Count the open; never let a failed counter break the page.
  try {
    await ref.update({ views: FieldValue.increment(1) });
  } catch {
    /* non-critical */
  }
  return data;
}

/** All share links a tenant has created, newest first (expired ones flagged). */
export async function listSharedReports(tenant: string): Promise<SharedReportSummary[]> {
  const snap = await collection().where("tenant", "==", tenant).get();
  return snap.docs
    .map((d) => {
      const r = d.data() as SharedReport;
      return {
        token: d.id,
        accountName: r.accountName,
        period: r.period,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        views: r.views ?? 0,
        expired: isExpired(r.expiresAt),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Revoke (hard-delete) a link the tenant owns. Returns false if it's missing or
 *  belongs to a different tenant. */
export async function revokeSharedReport(tenant: string, token: string): Promise<boolean> {
  const ref = collection().doc(token);
  const doc = await ref.get();
  if (!doc.exists || (doc.data() as SharedReport).tenant !== tenant) return false;
  await ref.delete();
  return true;
}
