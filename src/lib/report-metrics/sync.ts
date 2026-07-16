/** A1 sync: pull a project's account-level daily totals from Google Ads and persist
 *  them as the report's live source. Credential-gated — without a developer token, a
 *  connected Google account with the adwords scope, and a linked customer id, it
 *  returns a classified error (never throws) so the UI can say exactly what's missing.
 *  Reuses the existing OAuth (getUserAccessToken) + REST client (google/ads.ts).
 *  Server-only. */
import "server-only";
import type { Project } from "@/lib/projects/types";
import {
  adsConfigured,
  fetchAccountDailyRows,
  fetchAccountDailyShared,
  type DailySeriesBundle,
} from "@/lib/google/ads";
import type { CampaignPeriod } from "@/lib/campaigns/types";
import { getUserAccessToken, hasAdsScope } from "@/lib/google/token";
import { mapAdsRowsToMetrics, type AdsMetricRow } from "./map";
import { saveReportMetrics } from "./store";
import type { MetricRow } from "./types";

/** Trailing window to fetch — 400d covers the 365d report plus its prior-year delta. */
const SYNC_DAYS = 400;

export interface SyncResult {
  ok: boolean;
  rowCount?: number;
  customerId?: string;
  /** user-facing Czech reason when ok is false */
  error?: string;
}

/** Ads access for a project's report sync: the developer token, a signed-in user with
 *  the adwords scope + a live OAuth token, and the project's own linked customer id.
 *  Resolved once and shared by both the standalone and the Direction-3 shared sync so
 *  their preconditions + error copy never drift. */
type AdsAccess = { ok: true; token: string; customerId: string } | { ok: false; error: string };

async function resolveAdsAccess(project: Project, userId: string | null): Promise<AdsAccess> {
  if (!adsConfigured()) {
    return { ok: false, error: "Google Ads není nakonfigurován (chybí developer token na serveru)." };
  }
  if (!userId) return { ok: false, error: "Nejste přihlášeni." };
  const customerId = resolveCustomerId(project);
  if (!customerId) return { ok: false, error: "K projektu není napojený účet Google Ads." };
  const token = await getUserAccessToken(userId);
  if (!token) return { ok: false, error: "Chybí přístup ke Google účtu — přihlaste se přes Google." };
  if (!(await hasAdsScope(userId))) {
    return { ok: false, error: "Google účet nemá oprávnění pro Google Ads (adwords scope)." };
  }
  return { ok: true, token, customerId };
}

/** Persist the mapped daily rows as the project's live report source. The ONE place
 *  the sync meta is stamped, so the standalone and shared paths write byte-identical
 *  blobs from the same rows. */
async function persistMetrics(project: Project, customerId: string, rows: MetricRow[]): Promise<SyncResult> {
  if (rows.length === 0) {
    return { ok: false, error: "Google Ads nevrátil pro účet žádná data za období." };
  }
  await saveReportMetrics(project.id, {
    meta: {
      source: "google-ads",
      customerId,
      syncedAt: new Date().toISOString(),
      days: SYNC_DAYS,
      rowCount: rows.length,
    },
    rows,
  });
  return { ok: true, rowCount: rows.length, customerId };
}

/** The ad account for this project: its OWN explicitly-linked customer id (digits),
 *  or null. Deliberately NO fallback to the user's active connected account — in a
 *  multi-client workspace, resolving an unlinked project to whichever account the user
 *  last activated stored one client's real Ads spend/revenue under a different client's
 *  report (a data-isolation breach). A project must be explicitly linked to sync. */
function resolveCustomerId(project: Project): string | null {
  return project.adsCustomerId?.replace(/\D/g, "") || null;
}

/** Sync `project`'s live report metrics from Google Ads. Idempotent (replaces the
 *  stored series). Returns a classified result; the caller surfaces `error`. This is
 *  the STANDALONE path (manual sync + the cron fallback): it issues its own 400d read.
 *  The cron's report-refresh runs prefer {@link syncReportMetricsShared}, which shares
 *  that read with the campaigns series. */
export async function syncReportMetricsFromAds(project: Project, userId: string | null): Promise<SyncResult> {
  const access = await resolveAdsAccess(project, userId);
  if (!access.ok) return { ok: false, error: access.error };

  try {
    const rows = mapAdsRowsToMetrics(await fetchAccountDailyRows(access.token, access.customerId, SYNC_DAYS));
    return await persistMetrics(project, access.customerId, rows);
  } catch (err) {
    console.error(`[report-metrics] Ads sync failed for ${project.id}:`, err);
    return { ok: false, error: "Načtení dat z Google Ads selhalo." };
  }
}

/** Direction 3 — sync the report from the ONE shared 400d read AND return the
 *  campaigns period series (portfolio + per-campaign) sliced from the SAME rows, so
 *  the cron can thread it into the campaigns sync instead of issuing a second
 *  date-segmented query. The report blob persisted here is byte-identical to
 *  {@link syncReportMetricsFromAds} (same rows, same mapper, same meta) — adding
 *  `campaign.id` to the SELECT does not change the per-date sum. Never throws; a
 *  credential-gated / failed fetch returns a classified result and a null bundle, so
 *  the caller falls back to the campaigns sync's own series fetch. */
export async function syncReportMetricsShared(
  project: Project,
  userId: string | null,
  campaignPeriod: CampaignPeriod
): Promise<{ result: SyncResult; bundle: DailySeriesBundle | null }> {
  const access = await resolveAdsAccess(project, userId);
  if (!access.ok) return { result: { ok: false, error: access.error }, bundle: null };

  try {
    const { reportRows, bundle } = await fetchAccountDailyShared(
      access.token,
      access.customerId,
      SYNC_DAYS,
      campaignPeriod
    );
    const result = await persistMetrics(project, access.customerId, mapAdsRowsToMetrics(reportRows as AdsMetricRow[]));
    return { result, bundle };
  } catch (err) {
    console.error(`[report-metrics] shared Ads sync failed for ${project.id}:`, err);
    return { result: { ok: false, error: "Načtení dat z Google Ads selhalo." }, bundle: null };
  }
}
