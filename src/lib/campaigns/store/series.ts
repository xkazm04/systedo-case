/** The tenant's daily-series store (server-only): the portfolio trend chart
 *  series and the per-campaign sparkline series, one small doc per period. */
import "server-only";
import { activePeriod, type TenantRoot } from "./tenant";
import { tenantStore } from "./backend";
import { campaignSeriesDocId, seriesDocId } from "../store-keys";
import type { CampaignPeriod, DailyPoint } from "../types";

/** Replace the tenant's stored daily series *for one period* — one small doc
 *  per period (`series/{period}`; the legacy single doc was `series/latest`). */
export async function saveSeries(
  tenant: string,
  series: DailyPoint[],
  meta: { period: CampaignPeriod }
): Promise<void> {
  await (await tenantStore()).setDoc(tenant, "series", seriesDocId(meta.period), {
    period: meta.period,
    series,
    syncedAt: new Date().toISOString(),
  });
}

/** The tenant's daily series for `period` (defaults to the active period),
 *  oldest → newest, or []. Falls back to the legacy `latest` doc when it holds
 *  exactly the requested period (it always recorded its period). */
export async function getSeries(
  tenant: string,
  period?: CampaignPeriod,
  root?: TenantRoot
): Promise<DailyPoint[]> {
  const store = await tenantStore();
  const requested = period ?? (await activePeriod(tenant, root));
  if (requested) {
    const data = await store.getDoc(tenant, "series", seriesDocId(requested));
    if (Array.isArray(data?.series)) return data!.series as DailyPoint[];
  }
  const data = await store.getDoc(tenant, "series", "latest");
  if (!Array.isArray(data?.series)) return [];
  return !requested || data!.period === requested ? (data!.series as DailyPoint[]) : [];
}

/** Replace the tenant's stored per-campaign daily series (campaign id → points).
 *  One doc (`series/campaigns`): even 90 days × a handful of campaigns is a few
 *  tens of KB, far under the document limit. Overwritten only on a successful
 *  fetch — the sync pipeline applies the same only-overwrite-on-success rule as
 *  the portfolio series, so a transient hiccup can't blank the sparklines. */
export async function saveCampaignSeries(
  tenant: string,
  byId: Record<string, DailyPoint[]>,
  meta: { period: CampaignPeriod }
): Promise<void> {
  await (await tenantStore()).setDoc(tenant, "series", campaignSeriesDocId(meta.period), {
    period: meta.period,
    byId,
    syncedAt: new Date().toISOString(),
  });
}

/** The stored per-campaign daily series for `period` (defaults to the active
 *  period), or {}. Falls back to the legacy un-keyed `campaigns` doc when it
 *  holds exactly the requested period. */
export async function getCampaignSeries(
  tenant: string,
  period?: CampaignPeriod,
  root?: TenantRoot
): Promise<Record<string, DailyPoint[]>> {
  const store = await tenantStore();
  const requested = period ?? (await activePeriod(tenant, root));
  if (requested) {
    const keyed = await store.getDoc(tenant, "series", campaignSeriesDocId(requested));
    const byId = keyed?.byId;
    if (byId && typeof byId === "object") return byId as Record<string, DailyPoint[]>;
  }
  const data = await store.getDoc(tenant, "series", "campaigns");
  const byId = data?.byId;
  if (!byId || typeof byId !== "object") return {};
  return !requested || data!.period === requested ? (byId as Record<string, DailyPoint[]>) : {};
}
