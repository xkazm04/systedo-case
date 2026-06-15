/** Google Ads connector — an adapter with two providers behind one interface:
 *
 *   - sampleProvider()    → deterministic sample campaigns, used out of the box and
 *     for anonymous visitors (the case study still works with no Google account).
 *   - googleAdsProvider() → live Google Ads, used when the signed-in user has
 *     selected an account AND a developer token is configured. It calls the Ads
 *     REST API (GAQL) on the user's behalf via their OAuth token.
 *
 *  Server-only. `getConnectorForUser()` picks the provider per request.
 */
import { sampleCampaigns } from "./sample";
import { getAdsConnection } from "./connection";
import { adsConfigured, fetchCampaigns as adsFetchCampaigns } from "@/lib/google/ads";
import { getUserAccessToken } from "@/lib/google/token";
import type { Campaign, CampaignPeriod } from "./types";

export interface AdsConnector {
  /** stable id persisted alongside the data, surfaced in the UI */
  source: "sample" | "google-ads";
  /** human label for the source */
  label: string;
  fetchCampaigns(period: CampaignPeriod): Promise<Campaign[]>;
}

function sampleProvider(): AdsConnector {
  return {
    source: "sample",
    label: "Google Ads · ukázková data",
    async fetchCampaigns(period) {
      return sampleCampaigns(period);
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
  };
}

/** Live Google Ads when the user is signed in, has selected an account, and the
 *  developer token is configured; otherwise the deterministic sample provider. */
export async function getConnectorForUser(userId: string | null): Promise<AdsConnector> {
  if (userId && adsConfigured()) {
    const connection = await getAdsConnection(userId);
    if (connection) {
      const token = await getUserAccessToken(userId);
      if (token) return googleAdsProvider(token, connection.customerId);
    }
  }
  return sampleProvider();
}

/** Sample connector for anonymous / non-user contexts. */
export function getConnector(): AdsConnector {
  return sampleProvider();
}
