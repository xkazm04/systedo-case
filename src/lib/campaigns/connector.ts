/** Ads connector — a provider-neutral adapter: several data sources behind ONE
 *  interface, resolved per request through a small provider registry.
 *
 *   - sampleProvider()    → deterministic sample campaigns, used out of the box and
 *     for anonymous visitors (the case study still works with no ad account).
 *   - googleAdsProvider() → live Google Ads, used when the signed-in user has
 *     selected an account AND a developer token is configured. It calls the Ads
 *     REST API (GAQL) on the user's behalf via their OAuth token.
 *   - sklikProvider()     → live Sklik (Seznam's Czech ad platform), used when the
 *     signed-in user has no Google account connected AND a Sklik API token is
 *     configured. DATA-IN only (campaigns + daily stats); mutations stay Google-
 *     only. The per-user credentials flow is a documented follow-up.
 *
 *  Every LIVE provider shares one degrade-to-sample wrapper (withSampleFallback)
 *  so the fallback + truthful degradation flags behave identically across sources.
 *  Server-only. `resolveCampaignContext()` picks the provider + tenant per request.
 */
import { sampleCampaigns, sampleCampaignSeries, sampleSeries } from "./sample";
import { googleDemoEnvelope, type DemoEnvelope } from "./envelope";
import { performance } from "@/lib/data";
import { getAdsConnection, getConnectedAccount, type AdsConnection } from "./connection";
import {
  adsConfigured,
  fetchCampaigns as adsFetchCampaigns,
  fetchDailySeriesBundle as adsFetchDailySeriesBundle,
  type DailySeriesBundle,
} from "@/lib/google/ads";
import { getUserAccessToken } from "@/lib/google/token";
import {
  SklikClient,
  httpSklikTransport,
} from "@/lib/sklik/client";
import {
  fetchSklikCampaigns,
  fetchSklikCampaignSeries,
  fetchSklikSeries,
} from "@/lib/sklik/adapter";
import type { SklikMoneyMode } from "@/lib/sklik/types";
import { classifySklikMoneyUnit, type SklikMoneyVerdict } from "@/lib/sklik/money-verdict";
import { CAMPAIGN_PERIOD_DAYS, type Campaign, type CampaignPeriod, type DailyPoint } from "./types";
import { buildTenantKey, SKLIK_TENANT_SUFFIX } from "./store-keys";
import { getSklikConnection } from "./sklik-connection";
import { decryptToken } from "@/lib/inventory/token-crypto";
import type { ProjectType } from "@/lib/projects/types";

/** Stable id of the data source behind a connector, persisted alongside the data
 *  and surfaced in the UI. An OPEN union: new providers extend it without
 *  reshaping the seam (the store already types SyncMeta.source as string). */
export type AdsSource = "sample" | "google-ads" | "sklik";

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
  source: AdsSource;
  /** human label for the source */
  label: string;
  /** the account's ISO-4217 currency, captured at ingestion and persisted on the
   *  sync meta so money surfaces can label a non-CZK account honestly (Direction 2).
   *  Resolved DURING fetchCampaigns (like {@link degradation}), so read it AFTER —
   *  null until then / when the account provides none (→ treated as the base CZK). */
  currency: string | null;
  fetchCampaigns(period: CampaignPeriod): Promise<Campaign[]>;
  /** per-day portfolio totals for the trend chart */
  fetchSeries(period: CampaignPeriod): Promise<DailyPoint[]>;
  /** per-campaign daily series (campaign id → points) for the table sparklines */
  fetchCampaignSeries(period: CampaignPeriod): Promise<Record<string, DailyPoint[]>>;
  /** which of this request's fetches silently degraded to the sample provider —
   *  always all-false for the sample provider itself (sample is intended there) */
  degradation: SyncDegradation;
  /** Optional provider self-diagnostic (Direction 3): given the freshly-fetched
   *  campaigns + period, classify the money unit (Sklik costs-vs-budget → CZK vs
   *  haléře). Neutral — only Sklik supplies it; the sync pipeline calls it after a
   *  successful, non-degraded campaign fetch and persists the verdict on the sync
   *  meta. It NEVER converts; the actual ÷100 only happens once the owner confirms. */
  diagnoseMoneyUnit?(campaigns: Campaign[], period: CampaignPeriod): SklikMoneyVerdict;
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
    // Sample data is illustrative CZK — the base currency, so labels are unchanged.
    currency: "CZK",
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

/** The three raw fetchers a live provider supplies — the neutral data-in surface,
 *  before the degrade-to-sample wrapping. Google (@/lib/google/ads) and Sklik
 *  (@/lib/sklik/adapter) each bind their credentials into one of these. */
interface LiveFetchers {
  /** campaigns + the account's ISO currency (captured in the same fetch — Google
   *  from customer.currency_code, Sklik always CZK). */
  fetchCampaigns(period: CampaignPeriod): Promise<{ campaigns: Campaign[]; currency: string | null }>;
  fetchSeries(period: CampaignPeriod): Promise<DailyPoint[]>;
  fetchCampaignSeries(period: CampaignPeriod): Promise<Record<string, DailyPoint[]>>;
}

/**
 * Wrap a live provider's fetchers with the shared degrade-to-sample fallback.
 *
 * Any live call can fail transiently (expired token, quota, API error). Degrade
 * to the deterministic sample provider instead of throwing — one hiccup must not
 * 500 the whole premium dashboard, and the demo path is the documented safe
 * default. The underlying error is logged server-side AND recorded on
 * `degradation`, so the sync route can persist a truthful source label instead of
 * presenting the fallback's demo numbers as live account data.
 *
 * This is the ONE seam every live source shares — Google and Sklik get identical
 * fallback + flag semantics (campaigns fallback → `campaigns`; either series
 * fallback → `series`; first error's summary → `reason`).
 */
function withSampleFallback(
  source: AdsSource,
  label: string,
  live: LiveFetchers,
  fallback: AdsConnector
): AdsConnector {
  const degradation: SyncDegradation = { campaigns: false, series: false, reason: null };
  const connector: AdsConnector = {
    source,
    label,
    // Defaults to the fallback's currency (base CZK) until a live campaign fetch
    // resolves the real one; a degraded fetch (sample data shown) keeps the base.
    currency: fallback.currency,
    degradation,
    async fetchCampaigns(period) {
      try {
        const { campaigns, currency } = await live.fetchCampaigns(period);
        connector.currency = currency ?? fallback.currency;
        return campaigns;
      } catch (err) {
        console.error(`[campaigns] live fetchCampaigns (${source}) failed; serving sample data:`, err);
        degradation.campaigns = true;
        degradation.reason ??= describeError(err);
        connector.currency = fallback.currency;
        return fallback.fetchCampaigns(period);
      }
    },
    async fetchSeries(period) {
      try {
        return await live.fetchSeries(period);
      } catch (err) {
        console.error(`[campaigns] live fetchSeries (${source}) failed; serving sample data:`, err);
        degradation.series = true;
        degradation.reason ??= describeError(err);
        return fallback.fetchSeries(period);
      }
    },
    async fetchCampaignSeries(period) {
      try {
        return await live.fetchCampaignSeries(period);
      } catch (err) {
        console.error(`[campaigns] live fetchCampaignSeries (${source}) failed; serving sample data:`, err);
        // Trend data degraded to sample — same truth-in-labeling flag as the
        // portfolio series (the sync only persists this fetch on success anyway).
        degradation.series = true;
        degradation.reason ??= describeError(err);
        return fallback.fetchCampaignSeries(period);
      }
    },
  };
  return connector;
}

/** Live Google Ads provider — REST/GAQL calls bound to the user's OAuth token +
 *  selected customer, behind the shared sample fallback. Behaviour is unchanged
 *  from the pre-registry connector (byte-identical fallback + flags). */
function googleAdsProvider(
  accessToken: string,
  customerId: string,
  fallback: AdsConnector
): AdsConnector {
  // ONE date-segmented GAQL read per period, shared by the portfolio series and the
  // per-campaign series (which used to fire two round-trips over the SAME rows). A
  // fresh connector is built per sync, so this per-instance memo never serves stale
  // data across syncs; a rejected fetch is cached too, so a failing series doesn't
  // re-query — both fetchers then degrade off the one failure, as before.
  const bundleByPeriod = new Map<CampaignPeriod, Promise<DailySeriesBundle>>();
  const bundle = (period: CampaignPeriod): Promise<DailySeriesBundle> => {
    let p = bundleByPeriod.get(period);
    if (!p) {
      p = adsFetchDailySeriesBundle(accessToken, customerId, period);
      bundleByPeriod.set(period, p);
    }
    return p;
  };
  return withSampleFallback(
    "google-ads",
    "Google Ads · živá data",
    {
      // adsFetchCampaigns already returns { campaigns, currency } (currency captured
      // from customer.currency_code in the same GAQL query).
      fetchCampaigns: (period) => adsFetchCampaigns(accessToken, customerId, period),
      fetchSeries: async (period) => (await bundle(period)).portfolio,
      fetchCampaignSeries: async (period) => (await bundle(period)).perCampaign,
    },
    fallback
  );
}

/** Whether the deployment-wide env Sklik token is set. This is now only the DEV /
 *  DEPLOY FALLBACK — the primary credential is the caller's per-user encrypted token
 *  (see {@link resolveSklik}). Kept so a single-tenant self-host can still light up
 *  Sklik with one env var and no connect step. */
export function sklikConfigured(): boolean {
  return Boolean(process.env.SKLIK_API_TOKEN);
}

/** Live Sklik provider — one {@link SklikClient} (the caller's token + HTTP
 *  transport) per sync, its DATA-IN fetchers behind the same sample fallback as
 *  Google. The token is resolved by {@link resolveSklik} (per-user first, env
 *  fallback second); `mode` is the connection's confirmed money unit ("halere" ÷100
 *  only after the owner confirms, else the native-CZK default). The connector also
 *  carries the money-unit self-diagnostic so the sync can record a verdict. */
function sklikProvider(fallback: AdsConnector, token: string, mode: SklikMoneyMode): AdsConnector {
  const client = new SklikClient(httpSklikTransport(), token);
  const connector = withSampleFallback(
    "sklik",
    "Sklik · živá data",
    {
      // Sklik (Seznam) is a Czech platform — money is always native CZK, the base.
      fetchCampaigns: async (period) => ({
        campaigns: await fetchSklikCampaigns(client, period, mode),
        currency: "CZK",
      }),
      fetchSeries: (period) => fetchSklikSeries(client, period, mode),
      fetchCampaignSeries: (period) => fetchSklikCampaignSeries(client, period, mode),
    },
    fallback
  );
  connector.diagnoseMoneyUnit = (campaigns, period) =>
    classifySklikMoneyUnit(campaigns, CAMPAIGN_PERIOD_DAYS[period]);
  return connector;
}

/** One entry in the live-provider registry: given the resolved request context,
 *  return a connector when this provider's credentials are available, else null
 *  (so the next provider — ultimately the sample fallback — is tried). Ordered by
 *  precedence in LIVE_PROVIDERS. */
interface ResolveCtx {
  userId: string;
  /** the user's active/overridden Google Ads connection, if any */
  connection: AdsConnection | null;
  /** the deterministic sample connector this request would otherwise serve */
  fallback: AdsConnector;
}
type LiveProviderResolver = (ctx: ResolveCtx) => Promise<AdsConnector | null>;

/** Google wins whenever the user has a connected account + configured dev token +
 *  a live OAuth token — exactly the pre-registry condition. */
const resolveGoogle: LiveProviderResolver = async ({ userId, connection, fallback }) => {
  if (!connection || !adsConfigured()) return null;
  const token = await getUserAccessToken(userId);
  return token ? googleAdsProvider(token, connection.customerId, fallback) : null;
};

/** Sklik applies to a signed-in user with NO Google account connected. It prefers
 *  the caller's OWN per-user encrypted token; the deployment-wide env SKLIK_API_TOKEN
 *  is the documented dev/deploy fallback. It never overrides a Google connection
 *  (Google-first), so existing Google/sample behaviour is untouched. */
const resolveSklik: LiveProviderResolver = async ({ userId, connection, fallback }) => {
  if (connection) return null;
  const conn = await getSklikConnection(userId);
  // Per-user encrypted token first, env dev/deploy fallback second.
  const token = (conn?.tokenEnc ? decryptToken(conn.tokenEnc) : null) ?? process.env.SKLIK_API_TOKEN ?? null;
  if (!token) return null;
  // The money unit is the connection's CONFIRMED setting: "halere" (÷100) only after
  // the owner confirms the haléře verdict, else the native-CZK default — never silent.
  const mode: SklikMoneyMode = conn?.halereConfirmed ? "halere" : "czk";
  return sklikProvider(fallback, token, mode);
};

/** The stable account suffix a user's account-scoped tenant keys under when they
 *  have NO active Google account: `sklik` for a per-user Sklik connection (so a
 *  later Google connection can't orphan Sklik history — see SKLIK_TENANT_SUFFIX),
 *  else null (base key). Deliberately keyed on the PER-USER connection only — the
 *  env-only global token keeps the historical base key, so pre-existing env-token
 *  data is not stranded. Shared by the read (resolveTenant) and sync
 *  (resolveCampaignContext) paths so they never disagree. */
async function sklikAccountSuffix(userId: string): Promise<string | null> {
  return (await getSklikConnection(userId)) ? SKLIK_TENANT_SUFFIX : null;
}

/** Live providers in precedence order. The first to return a connector wins;
 *  none → the sample fallback. Adding a provider is a one-line registry change. */
const LIVE_PROVIDERS: readonly LiveProviderResolver[] = [resolveGoogle, resolveSklik];

/** The tenant a user's data lives under. Now **per-project**: callers that know
 *  the active project pass its id, isolating campaign/social/patterns/report data
 *  per project (`u_{userId}_proj_{projectId}`), with the connected-account id
 *  appended for live data so read and sync paths agree. User isolation is always
 *  preserved. When no project is supplied (public surfaces, legacy callers) it
 *  falls back to the per-user key; anonymous visitors share the `sample` tenant. */
export async function resolveTenant(
  userId: string | null,
  projectId?: string | null,
  opts: { accountScoped?: boolean } = {}
): Promise<string> {
  if (!userId) return "sample";
  // Account-AGNOSTIC domains (social posts/inbox, microsites, shareable report links,
  // the activity timeline) pass accountScoped:false so their key never carries the
  // volatile Ads customerId — otherwise connecting / switching / disconnecting an Ads
  // account changes the key and orphans that user-created content. Account-SCOPED Ads
  // data (campaigns/series/snapshots/report-metrics) keeps the default suffix so its
  // read and sync keys agree.
  if (opts.accountScoped === false) return buildTenantKey(userId, projectId);
  const connection = await getAdsConnection(userId);
  // Google account wins the suffix; with none, a per-user Sklik connection gets the
  // stable `sklik` suffix so read and sync tenants agree AND a later Google connect
  // never orphans Sklik history (see sklikAccountSuffix / SKLIK_TENANT_SUFFIX).
  const suffix = connection?.customerId ?? (await sklikAccountSuffix(userId));
  return buildTenantKey(userId, projectId, suffix);
}

/** The tenant key for a SPECIFIC connected account — the read-side counterpart of
 *  resolveCampaignContext's per-account fan-out. Scheduled readers (digest, report)
 *  use this to iterate every connected account the same way `sync` writes them,
 *  instead of collapsing to the single active account via resolveTenant (which reads
 *  only getAdsConnection). `customerId` must be one the user owns — callers pass ids
 *  straight from listConnectedAccounts. Computes the exact key resolveCampaignContext
 *  would for that account, so read and write tenants stay identical. */
export function resolveTenantForAccount(
  userId: string,
  projectId: string | null | undefined,
  customerId: string
): string {
  return buildTenantKey(userId, projectId, customerId);
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
  const sample = () => sampleProvider(projectType, projectId ?? undefined);
  if (!userId) return { connector: sample(), tenant: "sample" };

  const override = customerId ? await getConnectedAccount(userId, customerId) : null;
  const connection = override ?? (await getAdsConnection(userId));
  // Tenant keying hangs off the Google connection's customerId when present; a
  // Sklik-sourced user (no Google connection) with a per-user token keys on the
  // stable `sklik` suffix instead of the bare base — the SAME suffix resolveTenant
  // applies on the read side, so read and sync tenants agree AND a later Google
  // connection can never orphan the Sklik-synced history.
  const suffix = connection?.customerId ?? (await sklikAccountSuffix(userId));
  const tenant = buildTenantKey(userId, projectId, suffix);

  // Provider registry: try each live provider in precedence order; the first whose
  // credentials resolve wins, otherwise the deterministic sample provider. This
  // replaces the old binary Google/sample branch without changing either outcome
  // when no new provider is configured.
  const ctx: ResolveCtx = { userId, connection, fallback: sample() };
  for (const resolve of LIVE_PROVIDERS) {
    const connector = await resolve(ctx);
    if (connector) return { connector, tenant };
  }
  return { connector: sample(), tenant };
}
