/** Google Ads connector — an adapter with two providers behind one interface:
 *
 *   - sampleProvider()    → deterministic sample campaigns, used out of the box and
 *     for anonymous visitors (the case study still works with no Google account).
 *   - googleAdsProvider() → live Google Ads, used when the signed-in user has
 *     selected an account AND a developer token is configured. It calls the Ads
 *     REST API (GAQL) on the user's behalf via their OAuth token.
 *
 *  Server-only. `resolveCampaignContext()` picks the provider + tenant per request.
 */
import { sampleCampaigns, sampleSeries } from "./sample";
import { getAdsConnection } from "./connection";
import {
  adsConfigured,
  fetchCampaigns as adsFetchCampaigns,
  fetchDailySeries as adsFetchDailySeries,
} from "@/lib/google/ads";
import { getUserAccessToken } from "@/lib/google/token";
import type { Campaign, CampaignPeriod, DailyPoint } from "./types";
import type { ProjectType } from "@/lib/projects/types";

export interface AdsConnector {
  /** stable id persisted alongside the data, surfaced in the UI */
  source: "sample" | "google-ads";
  /** human label for the source */
  label: string;
  fetchCampaigns(period: CampaignPeriod): Promise<Campaign[]>;
  /** per-day portfolio totals for the trend chart */
  fetchSeries(period: CampaignPeriod): Promise<DailyPoint[]>;
}

function sampleProvider(projectType?: ProjectType, seedKey?: string): AdsConnector {
  return {
    source: "sample",
    label: "Google Ads · ukázková data",
    async fetchCampaigns(period) {
      return sampleCampaigns(period, projectType, seedKey);
    },
    async fetchSeries(period) {
      return sampleSeries(period, projectType, seedKey);
    },
  };
}

function googleAdsProvider(accessToken: string, customerId: string): AdsConnector {
  return {
    source: "google-ads",
    label: "Google Ads · živá data",
    async fetchCampaigns(period) {
      return adsFetchCampaigns(accessToken, customerId, period);
    },
    async fetchSeries(period) {
      return adsFetchDailySeries(accessToken, customerId, period);
    },
  };
}

/** The tenant a user's data lives under. Now **per-project**: callers that know
 *  the active project pass its id, isolating campaign/social/patterns/report data
 *  per project (`u_{userId}_proj_{projectId}`), with the connected-account id
 *  appended for live data so read and sync paths agree. User isolation is always
 *  preserved. When no project is supplied (public surfaces, legacy callers) it
 *  falls back to the per-user key; anonymous visitors share the `sample` tenant. */
export async function resolveTenant(
  userId: string | null,
  projectId?: string | null
): Promise<string> {
  if (!userId) return "sample";
  const connection = await getAdsConnection(userId);
  const base = projectId ? `u_${userId}_proj_${projectId}` : `u_${userId}`;
  return connection ? `${base}_${connection.customerId}` : base;
}

/** Resolve both the connector and the tenant for a request in one pass: live
 *  Google Ads when the user is signed in, has selected an account, the developer
 *  token is configured, and a valid OAuth token exists; the deterministic sample
 *  provider otherwise. The tenant is per-project when `projectId` is supplied.
 *  `projectType` lets the sample provider produce domain-appropriate data. */
export async function resolveCampaignContext(
  userId: string | null,
  projectId?: string | null,
  projectType?: ProjectType
): Promise<{ connector: AdsConnector; tenant: string }> {
  if (!userId) return { connector: sampleProvider(projectType, projectId ?? undefined), tenant: "sample" };

  const connection = await getAdsConnection(userId);
  const base = projectId ? `u_${userId}_proj_${projectId}` : `u_${userId}`;
  const tenant = connection ? `${base}_${connection.customerId}` : base;

  if (connection && adsConfigured()) {
    const token = await getUserAccessToken(userId);
    if (token) return { connector: googleAdsProvider(token, connection.customerId), tenant };
  }
  return { connector: sampleProvider(projectType, projectId ?? undefined), tenant };
}
