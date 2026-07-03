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
import { sampleCampaigns, sampleCampaignSeries, sampleSeries } from "./sample";
import { googleDemoEnvelope, type DemoEnvelope } from "./envelope";
import { performance } from "@/lib/data";
import { getAdsConnection, getConnectedAccount } from "./connection";
import {
  adsConfigured,
  fetchCampaigns as adsFetchCampaigns,
  fetchCampaignDailySeries as adsFetchCampaignDailySeries,
  fetchDailySeries as adsFetchDailySeries,
} from "@/lib/google/ads";
import { getUserAccessToken } from "@/lib/google/token";
import { CAMPAIGN_PERIOD_DAYS, type Campaign, type CampaignPeriod, type DailyPoint } from "./types";
import type { ProjectType } from "@/lib/projects/types";

/** Per-request outcome of the live→sample fallback. The sync route persists it
 *  so degraded data is labeled truthfully — a tenant whose token expired must
 *  never see deterministic demo numbers presented as their live account data. */
export interface SyncDegradation {
  /** the live campaign fetch failed and sample data was served instead */
  campaigns: boolean;
  /** the live series fetch failed and sample data was served instead */
  series: boolean;
  /** error summary of the first live failure (for the sync meta / diagnostics) */
  reason: string | null;
}

export interface AdsConnector {
  /** stable id persisted alongside the data, surfaced in the UI */
  source: "sample" | "google-ads";
  /** human label for the source */
  label: string;
  fetchCampaigns(period: CampaignPeriod): Promise<Campaign[]>;
  /** per-day portfolio totals for the trend chart */
  fetchSeries(period: CampaignPeriod): Promise<DailyPoint[]>;
  /** per-campaign daily series (campaign id → points) for the table sparklines */
  fetchCampaignSeries(period: CampaignPeriod): Promise<Record<string, DailyPoint[]>>;
  /** which of this request's fetches silently degraded to the sample provider —
   *  always all-false for the sample provider itself (sample is intended there) */
  degradation: SyncDegradation;
}

/** Compact, persistable summary of a live-fetch error (class + message, capped). */
function describeError(err: unknown): string {
  return (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 300);
}

function sampleProvider(projectType?: ProjectType, seedKey?: string): AdsConnector {
  // The e-shop sample campaigns describe the SAME client as the case-study
  // dashboard, so reconcile their period totals with the dashboard's Google
  // channel share of the same window (dataset injected here — the sample
  // generator stays JSON-free for the unit-test resolve hook). Other project
  // types have no dashboard counterpart and keep their tuned profiles.
  const envelopeFor = (period: CampaignPeriod): DemoEnvelope | null =>
    (projectType ?? "eshop") === "eshop"
      ? googleDemoEnvelope(performance, CAMPAIGN_PERIOD_DAYS[period])
      : null;
  return {
    source: "sample",
    label: "Google Ads · ukázková data",
    degradation: { campaigns: false, series: false, reason: null },
    async fetchCampaigns(period) {
      return sampleCampaigns(period, projectType, seedKey, Date.now(), envelopeFor(period));
    },
    async fetchSeries(period) {
      return sampleSeries(period, projectType, seedKey, envelopeFor(period));
    },
    async fetchCampaignSeries(period) {
      return sampleCampaignSeries(period, projectType, seedKey, envelopeFor(period));
    },
  };
}

function googleAdsProvider(
  accessToken: string,
  customerId: string,
  fallback: AdsConnector
): AdsConnector {
  // A live Google Ads call can fail transiently (expired token, quota, GAQL error).
  // Degrade to the deterministic sample provider instead of throwing — one hiccup
  // must not 500 the whole premium dashboard, and the demo path is the documented
  // safe default. The underlying error is logged server-side AND recorded on
  // `degradation`, so the sync route can persist a truthful source label instead
  // of presenting the fallback's demo numbers as live account data.
  const degradation: SyncDegradation = { campaigns: false, series: false, reason: null };
  return {
    source: "google-ads",
    label: "Google Ads · živá data",
    degradation,
    async fetchCampaigns(period) {
      try {
        return await adsFetchCampaigns(accessToken, customerId, period);
      } catch (err) {
        console.error("[campaigns] live fetchCampaigns failed; serving sample data:", err);
        degradation.campaigns = true;
        degradation.reason ??= describeError(err);
        return fallback.fetchCampaigns(period);
      }
    },
    async fetchSeries(period) {
      try {
        return await adsFetchDailySeries(accessToken, customerId, period);
      } catch (err) {
        console.error("[campaigns] live fetchSeries failed; serving sample data:", err);
        degradation.series = true;
        degradation.reason ??= describeError(err);
        return fallback.fetchSeries(period);
      }
    },
    async fetchCampaignSeries(period) {
      try {
        return await adsFetchCampaignDailySeries(accessToken, customerId, period);
      } catch (err) {
        console.error("[campaigns] live fetchCampaignSeries failed; serving sample data:", err);
        // Trend data degraded to sample — same truth-in-labeling flag as the
        // portfolio series (the sync only persists this fetch on success anyway).
        degradation.series = true;
        degradation.reason ??= describeError(err);
        return fallback.fetchCampaignSeries(period);
      }
    },
  };
}

/** Build the per-tenant key, sanitizing each component so it can't break out of
 *  the Firestore document path (a "/" in a component would be reinterpreted as a
 *  nested sub-collection). One helper so the read path (resolveTenant) and the sync
 *  path (resolveCampaignContext) can never compute a different key for one request. */
function buildTenantKey(userId: string, projectId?: string | null, customerId?: string | null): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");
  const base = projectId ? `u_${safe(userId)}_proj_${safe(projectId)}` : `u_${safe(userId)}`;
  return customerId ? `${base}_${safe(customerId)}` : base;
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
  return buildTenantKey(userId, projectId, connection?.customerId);
}

/** Resolve both the connector and the tenant for a request in one pass: live
 *  Google Ads when the user is signed in, has selected an account, the developer
 *  token is configured, and a valid OAuth token exists; the deterministic sample
 *  provider otherwise. The tenant is per-project when `projectId` is supplied.
 *  `projectType` lets the sample provider produce domain-appropriate data.
 *  `customerId` overrides the active account (the scheduled sync fans out over
 *  ALL connected accounts, not just the selected one); it must be one of the
 *  user's own connected accounts — an unknown id falls back to the active one,
 *  so the behaviour without the override is unchanged. */
export async function resolveCampaignContext(
  userId: string | null,
  projectId?: string | null,
  projectType?: ProjectType,
  customerId?: string | null
): Promise<{ connector: AdsConnector; tenant: string }> {
  if (!userId) return { connector: sampleProvider(projectType, projectId ?? undefined), tenant: "sample" };

  const override = customerId ? await getConnectedAccount(userId, customerId) : null;
  const connection = override ?? (await getAdsConnection(userId));
  const tenant = buildTenantKey(userId, projectId, connection?.customerId);

  if (connection && adsConfigured()) {
    const token = await getUserAccessToken(userId);
    if (token)
      return {
        connector: googleAdsProvider(
          token,
          connection.customerId,
          sampleProvider(projectType, projectId ?? undefined)
        ),
        tenant,
      };
  }
  return { connector: sampleProvider(projectType, projectId ?? undefined), tenant };
}
