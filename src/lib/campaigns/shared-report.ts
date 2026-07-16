/** Client-shareable report: snapshot the portfolio AI evaluation + campaigns into
 *  a read-only doc behind an unguessable token, so a user can hand a client a link.
 *  Links carry a TTL (auto-expire), count views, and can be listed + revoked by the
 *  tenant that created them — so a handed-out link is never an indefinite,
 *  unrevocable data exposure. Server-only. */
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase";
import type { CampaignReport, ReportHistoryPoint, AnalysisPeriod, MonthlyRecapResult } from "../ai-types";
import type { Campaign, DailyPoint } from "./types";
import type { Project, ProjectType } from "@/lib/projects/types";
import {
  getReportHistory,
  getReportsForPeriod,
  getSeries,
  getSyncMeta,
  listCampaigns,
} from "./store";
import { getReportConfig } from "./report-config";
import { resolveReportDataset } from "@/lib/report-metrics/resolve";
import { getCostModel } from "@/lib/cost-model/store";
import { getProjectGoal } from "@/lib/goals/store";
import { assembleReport } from "@/lib/report/assemble";
import { getRecaps, latestForPeriod } from "@/lib/recaps";
import type { ReportSnap, ReportTileSpec } from "@/lib/report/compute";
import type { MonthAttainment } from "@/lib/metrics";

/** How long a freshly-created share link stays live. */
export const SHARE_TTL_DAYS = 30;

/** The period the shared client report renders as its primary view (the in-app
 *  report's default). Snaps for all periods are captured; this one is shown. */
const SHARED_REPORT_PERIOD: AnalysisPeriod = "30d";

/** Direction 1: the in-app Monthly Report's tile model, snapshotted into the share so
 *  the client link shows the SAME type-aware report the tenant sees — not just the
 *  campaigns-portfolio eval. Assembled by the one shared helper (report/assemble.ts),
 *  so the numbers are pinned equal to the in-app report for the same inputs. Optional
 *  on {@link SharedReport}: a link created before this shipped has no payload and the
 *  public page falls back to the legacy layout. */
export interface SharedMonthlyReport {
  projectName: string;
  logoUrl?: string;
  accentColor?: string;
  /** drives the type-aware tile labels the shared page renders */
  type: ProjectType;
  /** the snapshot was taken from the client's own synced Ads data (vs the sample spine) */
  live: boolean;
  tiles: ReportTileSpec[];
  /** per-period figures + deltas (all periods captured; `period` names the shown one) */
  snaps: Record<AnalysisPeriod, ReportSnap>;
  /** which period the shared page renders as primary */
  period: AnalysisPeriod;
  /** goal-attainment track record (e-shop only; [] otherwise) */
  attainment: MonthAttainment[];
  /** the newest persisted recap for `period` at share time, when one exists */
  recap?: { result: MonthlyRecapResult; createdAt: string } | null;
}

/** Build the Monthly Report tile-model snapshot for a project, or null when there's
 *  no project context (an anonymous / project-less share keeps the legacy layout).
 *  Best-effort — a store hiccup degrades to null rather than failing the whole share. */
async function buildSharedMonthlyReport(project: Project | undefined): Promise<SharedMonthlyReport | null> {
  if (!project) return null;
  try {
    const resolved = await resolveReportDataset(project);
    const costModel = project.type === "eshop" ? await getCostModel(project.id) : null;
    // Direction 2: resolve the project's REAL goal (over the sample) so the shared
    // link's attainment matches the in-app report exactly.
    const projectGoal = project.type === "eshop" ? await getProjectGoal(project.id) : null;
    const { tiles, snaps, attainment } = assembleReport({
      dataset: resolved.data,
      type: project.type,
      live: resolved.live,
      costModel,
      goalHistory: projectGoal?.history ?? [],
      ...(projectGoal ? { monthlyRevenueGoal: projectGoal.goal } : {}),
    });
    // The newest persisted recap for the shown period (the in-app report renders this
    // same stored narrative on load) — omitted when the tenant has never generated one.
    const stored = latestForPeriod(await getRecaps(project.id).catch(() => null), SHARED_REPORT_PERIOD);
    return {
      projectName: project.name,
      // Conditional spreads so no `undefined` reaches Firestore (which rejects it).
      ...(project.logoUrl ? { logoUrl: project.logoUrl } : {}),
      ...(project.accentColor ? { accentColor: project.accentColor } : {}),
      type: project.type,
      live: resolved.live,
      tiles,
      snaps,
      period: SHARED_REPORT_PERIOD,
      attainment,
      recap: stored ? { result: stored.result, createdAt: stored.createdAt } : null,
    };
  } catch (err) {
    console.error(`[shared-report] monthly-report snapshot failed for ${project.id}:`, err);
    return null;
  }
}

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
  /** Direction 1: the in-app Monthly Report tile model + newest recap, snapshotted so
   *  the client link renders the SAME type-aware report as the PRIMARY section (the
   *  campaigns-portfolio eval below becomes a labeled secondary). Absent on links
   *  created before this shipped → the public page falls back to the legacy layout. */
  monthlyReport?: SharedMonthlyReport | null;
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
  brandFallback?: { name?: string; accent?: string; logo?: string },
  // Direction 1: the active project — its resolved dataset grounds the Monthly Report
  // tile-model snapshot captured alongside the portfolio eval. Omitted (anonymous /
  // project-less share) → no tile payload, the public page keeps the legacy layout.
  project?: Project
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
    monthlyReport: await buildSharedMonthlyReport(project),
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
