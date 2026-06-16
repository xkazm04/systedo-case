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

export interface AdsConnector {
  /** stable id persisted alongside the data, surfaced in the UI */
  source: "sample" | "google-ads";
  /** human label for the source */
  label: string;
  fetchCampaigns(period: CampaignPeriod): Promise<Campaign[]>;
  /** per-day portfolio totals for the trend chart */
  fetchSeries(period: CampaignPeriod): Promise<DailyPoint[]>;
}

function sampleProvider(): AdsConnector {
  return {
    source: "sample",
    label: "Google Ads · ukázková data",
    async fetchCampaigns(period) {
      return sampleCampaigns(period);
    },
    async fetchSeries(period) {
      return sampleSeries(period);
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

/** The Firestore tenant a user's campaign data lives under. Based on the selected
 *  account (not token availability) so the read and sync paths always agree:
 *  per-account for a connected user, per-user for a signed-in user without a
 *  selection, and a shared `sample` tenant for anonymous visitors. */
export async function resolveTenant(userId: string | null): Promise<string> {
  if (!userId) return "sample";
  const connection = await getAdsConnection(userId);
  return connection ? `u_${userId}_${connection.customerId}` : `u_${userId}`;
}

/** Resolve both the connector and the tenant for a request in one pass: live
 *  Google Ads when the user is signed in, has selected an account, the developer
 *  token is configured, and a valid OAuth token exists; the deterministic sample
 *  provider otherwise — but always writing to the user's own tenant. */
export async function resolveCampaignContext(
  userId: string | null
): Promise<{ connector: AdsConnector; tenant: string }> {
  if (!userId) return { connector: sampleProvider(), tenant: "sample" };

  const connection = await getAdsConnection(userId);
  const tenant = connection ? `u_${userId}_${connection.customerId}` : `u_${userId}`;

  if (connection && adsConfigured()) {
    const token = await getUserAccessToken(userId);
    if (token) return { connector: googleAdsProvider(token, connection.customerId), tenant };
  }
  return { connector: sampleProvider(), tenant };
}
