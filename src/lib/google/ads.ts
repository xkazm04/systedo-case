/** Minimal Google Ads API (REST) client — server-only, dependency-free (uses
 *  fetch, no google-ads-api lib). Calls are made on behalf of the signed-in user
 *  with their OAuth access token + the app's developer token. Returns data already
 *  mapped into this app's framework-free `Campaign` model.
 *
 *  Requires GOOGLE_ADS_DEVELOPER_TOKEN; without it the connector stays on sample
 *  data and these functions are never called. */
import "server-only";
import {
  CAMPAIGN_PERIOD_DAYS,
  type Campaign,
  type CampaignPeriod,
  type CampaignStatus,
  type CampaignType,
  type DailyPoint,
} from "@/lib/campaigns/types";

const API_VERSION = "v18";
const BASE = `https://googleads.googleapis.com/${API_VERSION}`;

export interface AdsAccount {
  /** customer id, digits only (no dashes) */
  customerId: string;
  /** descriptive name when available, else the formatted id */
  name: string;
}

export function adsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
}

function headers(accessToken: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    "Content-Type": "application/json",
  };
  const login = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, "");
  if (login) h["login-customer-id"] = login;
  return h;
}

/** Pretty "123-456-7890" from a raw customer id. */
export function formatCustomerId(id: string): string {
  const d = id.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d;
}

/** Customer ids the user's Google account can access (across any MCCs). */
export async function listAccessibleCustomers(accessToken: string): Promise<string[]> {
  const res = await fetch(`${BASE}/customers:listAccessibleCustomers`, {
    method: "GET",
    headers: headers(accessToken),
  });
  if (!res.ok) {
    throw new Error(`Google Ads listAccessibleCustomers ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const json = (await res.json()) as { resourceNames?: string[] };
  // "customers/1234567890" → "1234567890"
  return (json.resourceNames ?? []).map((rn) => rn.split("/")[1]!).filter(Boolean);
}

interface SearchRow {
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    advertisingChannelType?: string;
  };
  campaignBudget?: {
    resourceName?: string;
    amountMicros?: string | number;
  };
  customer?: { descriptiveName?: string; id?: string };
  segments?: { date?: string };
  metrics?: {
    impressions?: string | number;
    clicks?: string | number;
    costMicros?: string | number;
    conversions?: string | number;
    conversionsValue?: string | number;
  };
}

/** Run a GAQL query against one customer via searchStream; returns flat rows. */
async function searchStream(accessToken: string, customerId: string, query: string): Promise<SearchRow[]> {
  const res = await fetch(`${BASE}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers: headers(accessToken),
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Google Ads searchStream ${res.status}: ${await res.text().catch(() => "")}`);
  }
  // searchStream returns an array of batches, each { results: [...] }.
  const batches = (await res.json()) as Array<{ results?: SearchRow[] }>;
  return batches.flatMap((b) => b.results ?? []);
}

/** Descriptive name for a customer (best-effort; falls back to the formatted id). */
export async function getAccountName(accessToken: string, customerId: string): Promise<AdsAccount> {
  try {
    const rows = await searchStream(
      accessToken,
      customerId,
      "SELECT customer.descriptive_name, customer.id FROM customer LIMIT 1"
    );
    const name = rows[0]?.customer?.descriptiveName;
    return { customerId, name: name || formatCustomerId(customerId) };
  } catch {
    return { customerId, name: formatCustomerId(customerId) };
  }
}

/** Pause a campaign (sets status PAUSED) via the campaigns:mutate endpoint. */
export async function pauseCampaign(
  accessToken: string,
  customerId: string,
  campaignId: string
): Promise<void> {
  const res = await fetch(`${BASE}/customers/${customerId}/campaigns:mutate`, {
    method: "POST",
    headers: headers(accessToken),
    body: JSON.stringify({
      operations: [
        {
          update: {
            resourceName: `customers/${customerId}/campaigns/${campaignId}`,
            status: "PAUSED",
          },
          updateMask: "status",
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Ads pauseCampaign ${res.status}: ${await res.text().catch(() => "")}`);
  }
}

export interface CampaignBudgetInfo {
  campaignId: string;
  /** the CampaignBudget resource to mutate (campaigns can share one) */
  budgetResourceName: string;
  /** current daily budget, in micros of the account currency */
  amountMicros: number;
}

/** Current daily budget (resource name + micros) for specific campaigns — what
 *  `applyBudgetShift` reads before re-pointing money between two campaigns. */
export async function fetchCampaignBudgets(
  accessToken: string,
  customerId: string,
  campaignIds: string[]
): Promise<Map<string, CampaignBudgetInfo>> {
  const ids = campaignIds.map((id) => id.replace(/\D/g, "")).filter(Boolean);
  if (ids.length === 0) return new Map();
  const rows = await searchStream(
    accessToken,
    customerId,
    `SELECT campaign.id, campaign_budget.resource_name, campaign_budget.amount_micros
     FROM campaign WHERE campaign.id IN (${ids.map((id) => `'${id}'`).join(", ")})`
  );
  const out = new Map<string, CampaignBudgetInfo>();
  for (const r of rows) {
    const campaignId = r.campaign?.id ? String(r.campaign.id) : null;
    const budgetResourceName = r.campaignBudget?.resourceName;
    if (!campaignId || !budgetResourceName) continue;
    out.set(campaignId, {
      campaignId,
      budgetResourceName,
      amountMicros: num(r.campaignBudget?.amountMicros),
    });
  }
  return out;
}

/** Set a campaign budget's daily amount (micros) via the campaignBudgets:mutate
 *  endpoint. The caller computes the new amount; this just writes it. */
export async function setCampaignBudgetMicros(
  accessToken: string,
  customerId: string,
  budgetResourceName: string,
  amountMicros: number
): Promise<void> {
  const res = await fetch(`${BASE}/customers/${customerId}/campaignBudgets:mutate`, {
    method: "POST",
    headers: headers(accessToken),
    body: JSON.stringify({
      operations: [
        {
          update: { resourceName: budgetResourceName, amountMicros: String(Math.round(amountMicros)) },
          updateMask: "amount_micros",
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Ads setCampaignBudget ${res.status}: ${await res.text().catch(() => "")}`);
  }
}

/** Portfolio daily series for the period — date-segmented metrics summed across
 *  all campaigns. Powers the live trend chart (the per-campaign fetch is
 *  date-aggregated and so can't). */
export async function fetchDailySeries(
  accessToken: string,
  customerId: string,
  period: CampaignPeriod
): Promise<DailyPoint[]> {
  const { start, end } = dateRange(CAMPAIGN_PERIOD_DAYS[period]);
  const query = `
    SELECT
      segments.date,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `;
  const rows = await searchStream(accessToken, customerId, query);

  const byDate = new Map<string, DailyPoint>();
  for (const r of rows) {
    const date = r.segments?.date;
    if (!date) continue;
    const p = byDate.get(date) ?? { date, cost: 0, conversions: 0, conversionValue: 0 };
    p.cost += Math.round(num(r.metrics?.costMicros) / 1_000_000);
    p.conversions += num(r.metrics?.conversions);
    p.conversionValue += Math.round(num(r.metrics?.conversionsValue));
    byDate.set(date, p);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Account-level daily rows for the last `days` — the series the monthly report's
 *  live seam (A1) ingests. Date-segmented over `campaign` (so one row per campaign
 *  per day; the caller sums per date) and, unlike `fetchDailySeries`, selects
 *  `metrics.clicks` too (→ visits). Returns raw searchStream rows; the pure mapper
 *  in report-metrics/map.ts turns them into daily totals with no credentials needed. */
export async function fetchAccountDailyRows(
  accessToken: string,
  customerId: string,
  days: number
): Promise<SearchRow[]> {
  const { start, end } = dateRange(days);
  const query = `
    SELECT
      segments.date,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `;
  return searchStream(accessToken, customerId.replace(/\D/g, ""), query);
}

/** Per-campaign daily series for the period — the same date-segmented metrics as
 *  `fetchDailySeries`, kept per `campaign.id` instead of summed, so each table row
 *  can show its own trend sparkline. One extra GAQL query per sync. */
export async function fetchCampaignDailySeries(
  accessToken: string,
  customerId: string,
  period: CampaignPeriod
): Promise<Record<string, DailyPoint[]>> {
  const { start, end } = dateRange(CAMPAIGN_PERIOD_DAYS[period]);
  const query = `
    SELECT
      campaign.id,
      segments.date,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `;
  const rows = await searchStream(accessToken, customerId, query);

  const byCampaign = new Map<string, Map<string, DailyPoint>>();
  for (const r of rows) {
    const id = r.campaign?.id ? String(r.campaign.id) : null;
    const date = r.segments?.date;
    if (!id || !date) continue;
    const byDate = byCampaign.get(id) ?? new Map<string, DailyPoint>();
    const p = byDate.get(date) ?? { date, cost: 0, conversions: 0, conversionValue: 0 };
    p.cost += Math.round(num(r.metrics?.costMicros) / 1_000_000);
    p.conversions += num(r.metrics?.conversions);
    p.conversionValue += Math.round(num(r.metrics?.conversionsValue));
    byDate.set(date, p);
    byCampaign.set(id, byDate);
  }

  const out: Record<string, DailyPoint[]> = {};
  for (const [id, byDate] of byCampaign) {
    out[id] = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  return out;
}

const CHANNEL_TYPE: Record<string, CampaignType> = {
  SEARCH: "search",
  PERFORMANCE_MAX: "performance_max",
  SHOPPING: "shopping",
  DISPLAY: "display",
  DEMAND_GEN: "demand_gen",
  VIDEO: "video",
};

function toStatus(s: string | undefined): CampaignStatus {
  return s === "ENABLED" ? "enabled" : "paused";
}

function num(v: string | number | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dateRange(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

/** Campaigns + aggregated metrics for the period, mapped into the app's model. */
export async function fetchCampaigns(
  accessToken: string,
  customerId: string,
  period: CampaignPeriod
): Promise<Campaign[]> {
  const { start, end } = dateRange(CAMPAIGN_PERIOD_DAYS[period]);
  // No segments.date in SELECT → metrics aggregate per campaign over the range.
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `;
  const rows = await searchStream(accessToken, customerId, query);

  return rows
    .filter((r) => r.campaign?.id)
    .map((r) => {
      const c = r.campaign!;
      const m = r.metrics ?? {};
      // Daily budget (micros → CZK/day) — optional on the model, so a campaign
      // without a resolvable budget simply omits the field (never writes 0).
      const budgetPerDay = Math.round(num(r.campaignBudget?.amountMicros) / 1_000_000);
      return {
        id: String(c.id),
        name: c.name ?? `Kampaň ${c.id}`,
        type: CHANNEL_TYPE[c.advertisingChannelType ?? ""] ?? "search",
        status: toStatus(c.status),
        impressions: num(m.impressions),
        clicks: num(m.clicks),
        // cost is reported in micros of the account currency.
        cost: Math.round(num(m.costMicros) / 1_000_000),
        conversions: num(m.conversions),
        conversionValue: Math.round(num(m.conversionsValue)),
        ...(budgetPerDay > 0 ? { budgetPerDay } : {}),
      } satisfies Campaign;
    });
}
