/** Google Ads connector — an adapter with two providers behind one interface,
 *  mirroring the AI assistant's "works with a key, demo without" pattern:
 *
 *   - sampleProvider()    → deterministic sample campaigns, used out of the box.
 *   - googleAdsProvider() → used when GOOGLE_ADS_* env vars are present. The wire
 *     to the real Google Ads API is intentionally left as a single, well-marked
 *     seam: the official API needs a developer token, OAuth refresh token and
 *     customer IDs that can't be exercised from the repo, so it throws a clear,
 *     actionable error until that integration is added.
 *
 *  Server-only. `getConnector()` picks the provider from the environment.
 */
import { sampleCampaigns } from "./sample";
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

/** Env vars the real Google Ads API needs. Drop them into `.env.local` and wire
 *  the `fetchCampaigns` body to the official client to switch to live data. */
const GOOGLE_ADS_ENV = [
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID",
] as const;

function hasGoogleAdsCredentials(): boolean {
  return GOOGLE_ADS_ENV.every((k) => Boolean(process.env[k]));
}

function googleAdsProvider(): AdsConnector {
  return {
    source: "google-ads",
    label: "Google Ads · živá data",
    async fetchCampaigns() {
      // The seam for the real integration. Implement with the official Google Ads
      // API (GAQL query over campaign + metrics for the period) here.
      throw new Error(
        "Reálné napojení na Google Ads API zatím není zapojené. Konektor je připravený — " +
          "doplňte volání oficiálního klienta v googleAdsProvider.fetchCampaigns(). " +
          "Bez něj běží přehled na ukázkových datech."
      );
    },
  };
}

export function getConnector(): AdsConnector {
  return hasGoogleAdsCredentials() ? googleAdsProvider() : sampleProvider();
}
