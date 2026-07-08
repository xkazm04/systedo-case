/** A1 sync: pull a project's account-level daily totals from Google Ads and persist
 *  them as the report's live source. Credential-gated — without a developer token, a
 *  connected Google account with the adwords scope, and a linked customer id, it
 *  returns a classified error (never throws) so the UI can say exactly what's missing.
 *  Reuses the existing OAuth (getUserAccessToken) + REST client (google/ads.ts).
 *  Server-only. */
import "server-only";
import type { Project } from "@/lib/projects/types";
import { adsConfigured, fetchAccountDailyRows } from "@/lib/google/ads";
import { getUserAccessToken, hasAdsScope } from "@/lib/google/token";
import { getAdsConnection } from "@/lib/campaigns/connection";
import { mapAdsRowsToMetrics } from "./map";
import { saveReportMetrics } from "./store";

/** Trailing window to fetch — 400d covers the 365d report plus its prior-year delta. */
const SYNC_DAYS = 400;

export interface SyncResult {
  ok: boolean;
  rowCount?: number;
  customerId?: string;
  /** user-facing Czech reason when ok is false */
  error?: string;
}

/** The ad account for this project: its own linked customer id, else the user's
 *  active connected account. Digits only, or null when neither is present. */
async function resolveCustomerId(project: Project, userId: string): Promise<string | null> {
  const own = project.adsCustomerId?.replace(/\D/g, "");
  if (own) return own;
  try {
    const conn = await getAdsConnection(userId);
    return conn?.customerId?.replace(/\D/g, "") || null;
  } catch {
    return null;
  }
}

/** Sync `project`'s live report metrics from Google Ads. Idempotent (replaces the
 *  stored series). Returns a classified result; the caller surfaces `error`. */
export async function syncReportMetricsFromAds(project: Project, userId: string | null): Promise<SyncResult> {
  if (!adsConfigured()) {
    return { ok: false, error: "Google Ads není nakonfigurován (chybí developer token na serveru)." };
  }
  if (!userId) return { ok: false, error: "Nejste přihlášeni." };

  const customerId = await resolveCustomerId(project, userId);
  if (!customerId) return { ok: false, error: "K projektu není napojený účet Google Ads." };

  const token = await getUserAccessToken(userId);
  if (!token) return { ok: false, error: "Chybí přístup ke Google účtu — přihlaste se přes Google." };
  if (!(await hasAdsScope(userId))) {
    return { ok: false, error: "Google účet nemá oprávnění pro Google Ads (adwords scope)." };
  }

  try {
    const rows = mapAdsRowsToMetrics(await fetchAccountDailyRows(token, customerId, SYNC_DAYS));
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
  } catch (err) {
    console.error(`[report-metrics] Ads sync failed for ${project.id}:`, err);
    return { ok: false, error: "Načtení dat z Google Ads selhalo." };
  }
}
