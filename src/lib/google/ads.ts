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

/** A Google Ads REST failure carrying the HTTP status, so the connector's live-retry
 *  can classify it (401 → refresh token & retry once; 429/5xx → back off & retry once;
 *  400/403 → permanent, degrade immediately). Plain `Error`s (e.g. a network failure
 *  thrown by fetch) carry no status and are treated as transient by the classifier. */
export class AdsApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AdsApiError";
    this.status = status;
  }
}

/** How the connector's live-retry should treat a failed live fetch, from its HTTP
 *  status when present (provider-neutral — any error carrying a numeric `status`):
 *   - "token"     → 401: the token was accepted as unexpired but rejected (revoked /
 *                   clock skew). Resolve a FRESH token and retry once.
 *   - "backoff"   → 429 / 5xx, or a status-less error (a network failure thrown by
 *                   fetch). Wait a short backoff and retry once.
 *   - "permanent" → 400 / 403 / any other 4xx. Not worth a retry — degrade immediately.
 *  Pure (framework-free) so the classification is unit-testable without the network. */
export function classifyLiveError(err: unknown): "token" | "backoff" | "permanent" {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number" && Number.isFinite(status)) {
    if (status === 401) return "token";
    if (status === 429 || status >= 500) return "backoff";
    return "permanent"; // 400 / 403 / other 4xx
  }
  // No status: a fetch/network failure (TypeError "fetch failed", ECONN…, timeout) is
  // transient; anything else unrecognised degrades immediately rather than retrying.
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return err instanceof TypeError || /network|fetch failed|econn|etimedout|timeout|socket/i.test(msg)
    ? "backoff"
    : "permanent";
}

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

export interface SearchRow {
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
  customer?: { descriptiveName?: string; id?: string; currencyCode?: string; timeZone?: string };
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
    // Structured (status-carrying) so the live-retry can classify it; the message is
    // byte-identical to before, so a degraded sync's reason label is unchanged.
    throw new AdsApiError(res.status, `Google Ads searchStream ${res.status}: ${await res.text().catch(() => "")}`);
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

/** Re-enable a campaign — the inverse of {@link pauseCampaign}, used to resume a
 *  campaign a governed change-set paused (revert path). */
export async function resumeCampaign(
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
            status: "ENABLED",
          },
          updateMask: "status",
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Ads resumeCampaign ${res.status}: ${await res.text().catch(() => "")}`);
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

/** The metric columns every account-daily query selects, named once. This is the
 *  ONE Google Ads seam the report + campaign daily series share: a GAQL SELECT over
 *  `campaign` segmented by day, on behalf of the signed-in user. A second ad platform
 *  (Sklik, Meta) would NOT reuse this — the connector layer maps that provider's own
 *  API into the same `DailyPoint` shape at its own edge. */
const ACCOUNT_DAILY_METRICS = [
  "metrics.impressions",
  "metrics.clicks",
  "metrics.cost_micros",
  "metrics.conversions",
  "metrics.conversions_value",
] as const;

/** Shared account-daily fetcher — date-segmented metrics over `campaign` for the
 *  trailing `days` window, one raw `searchStream` row per campaign per day. Every
 *  live daily-ingestion path builds on this single query: the campaigns portfolio
 *  series ({@link fetchDailySeries}), the per-campaign series
 *  ({@link fetchCampaignDailySeries}), and the monthly report's A1 sync
 *  ({@link fetchAccountDailyRows}). Each caller maps the raw rows into its own store
 *  shape at the edge (summed per date, kept per campaign, or handed to a pure mapper).
 *  `extraSelect` prepends non-metric columns (e.g. `campaign.id`) without cloning the
 *  metric list; the caller passes the customerId exactly as it wants it queried
 *  (digits-only on the report path, as-linked on the campaigns path). */
async function fetchAccountDailyRaw(
  accessToken: string,
  customerId: string,
  days: number,
  extraSelect: readonly string[] = [],
  timeZone?: string | null
): Promise<SearchRow[]> {
  const { start, end } = dateRange(days, timeZone);
  // customer.time_zone + customer.currency_code ride along (one value per account) so any
  // caller can capture them via pickTimeZone / pickCurrency and persist them; the mappers
  // ignore both, so the summed/per-campaign output stays byte-identical.
  const columns = [...extraSelect, "segments.date", "customer.time_zone", "customer.currency_code", ...ACCOUNT_DAILY_METRICS];
  const query = `
    SELECT
      ${columns.join(",\n      ")}
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status != 'REMOVED'
  `;
  return searchStream(accessToken, customerId, query);
}

/** Fold one searchStream row into a date-keyed DailyPoint accumulator. Cost micros
 *  are converted to the major unit and rounded PER ROW — the campaigns path's
 *  long-standing behavior (the report path rounds once per day in its own mapper).
 *  conversionValue is accumulated RAW here and rounded exactly ONCE at the aggregate
 *  boundary (finalizePoint) — summing already-rounded per-row values drifts by up to
 *  half a unit per row, which a whole day of micro-conversions can compound. */
function accumulateDaily(byDate: Map<string, DailyPoint>, date: string, r: SearchRow): void {
  const p =
    byDate.get(date) ??
    { date, cost: 0, conversions: 0, conversionValue: 0, clicks: 0, impressions: 0 };
  p.cost += Math.round(num(r.metrics?.costMicros) / 1_000_000);
  p.conversions += num(r.metrics?.conversions);
  p.conversionValue += num(r.metrics?.conversionsValue);
  p.clicks = (p.clicks ?? 0) + num(r.metrics?.clicks);
  p.impressions = (p.impressions ?? 0) + num(r.metrics?.impressions);
  byDate.set(date, p);
}

/** Round the raw-accumulated conversionValue once, at the aggregate boundary. */
function finalizePoint(p: DailyPoint): DailyPoint {
  return { ...p, conversionValue: Math.round(p.conversionValue) };
}

const sortByDate = (pts: DailyPoint[]): DailyPoint[] =>
  pts.map(finalizePoint).sort((a, b) => a.date.localeCompare(b.date));

/** Sum date-segmented Ads rows into one sorted DailyPoint per day (portfolio total).
 *  Pure — unit-tested on fixtures without credentials. */
export function mapRowsToDailySeries(rows: SearchRow[]): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>();
  for (const r of rows) {
    const date = r.segments?.date;
    if (!date) continue;
    accumulateDaily(byDate, date, r);
  }
  return sortByDate([...byDate.values()]);
}

/** Same date-segmented aggregation as {@link mapRowsToDailySeries}, kept per
 *  `campaign.id` so each campaign row can render its own trend. Pure — fixture-tested. */
export function mapRowsToCampaignDailySeries(rows: SearchRow[]): Record<string, DailyPoint[]> {
  const byCampaign = new Map<string, Map<string, DailyPoint>>();
  for (const r of rows) {
    const id = r.campaign?.id ? String(r.campaign.id) : null;
    const date = r.segments?.date;
    if (!id || !date) continue;
    const byDate = byCampaign.get(id) ?? new Map<string, DailyPoint>();
    accumulateDaily(byDate, date, r);
    byCampaign.set(id, byDate);
  }
  const out: Record<string, DailyPoint[]> = {};
  for (const [id, byDate] of byCampaign) out[id] = sortByDate([...byDate.values()]);
  return out;
}

/** Portfolio daily series for the period — date-segmented metrics summed across
 *  all campaigns. Powers the live trend chart (the per-campaign fetch is
 *  date-aggregated and so can't). */
export async function fetchDailySeries(
  accessToken: string,
  customerId: string,
  period: CampaignPeriod,
  timeZone?: string | null
): Promise<DailyPoint[]> {
  return mapRowsToDailySeries(await fetchAccountDailyRaw(accessToken, customerId, CAMPAIGN_PERIOD_DAYS[period], [], timeZone));
}

/** Account-level daily rows for the last `days` — the series the monthly report's
 *  live seam (A1) ingests. Returns the shared fetcher's raw searchStream rows (one
 *  per campaign per day; the pure mapper in report-metrics/map.ts sums them per date
 *  with no credentials needed). Digits-only customerId, matching the report link. */
export async function fetchAccountDailyRows(
  accessToken: string,
  customerId: string,
  days: number,
  timeZone?: string | null
): Promise<SearchRow[]> {
  return fetchAccountDailyRaw(accessToken, customerId.replace(/\D/g, ""), days, [], timeZone);
}

/** Per-campaign daily series for the period — the same date-segmented metrics as
 *  `fetchDailySeries`, kept per `campaign.id` instead of summed, so each table row
 *  can show its own trend sparkline. One extra GAQL query per sync. */
export async function fetchCampaignDailySeries(
  accessToken: string,
  customerId: string,
  period: CampaignPeriod,
  timeZone?: string | null
): Promise<Record<string, DailyPoint[]>> {
  return mapRowsToCampaignDailySeries(
    await fetchAccountDailyRaw(accessToken, customerId, CAMPAIGN_PERIOD_DAYS[period], ["campaign.id"], timeZone)
  );
}

/** The portfolio series AND the per-campaign series in ONE date-segmented GAQL
 *  read. {@link fetchDailySeries} and {@link fetchCampaignDailySeries} issue the
 *  SAME query and map its rows two ways (summed vs kept per campaign); fetching the
 *  rows once and mapping twice halves the sync's daily-series round-trips. Adding
 *  `campaign.id` to the SELECT does not change the summed portfolio result — the
 *  portfolio mapper ignores it — so `portfolio` is byte-identical to
 *  `fetchDailySeries`. The connector memoises this per period so its `fetchSeries`
 *  and `fetchCampaignSeries` share the single fetch. */
export interface DailySeriesBundle {
  portfolio: DailyPoint[];
  perCampaign: Record<string, DailyPoint[]>;
}
export async function fetchDailySeriesBundle(
  accessToken: string,
  customerId: string,
  period: CampaignPeriod,
  timeZone?: string | null
): Promise<DailySeriesBundle> {
  const rows = await fetchAccountDailyRaw(accessToken, customerId, CAMPAIGN_PERIOD_DAYS[period], ["campaign.id"], timeZone);
  return { portfolio: mapRowsToDailySeries(rows), perCampaign: mapRowsToCampaignDailySeries(rows) };
}

/** Keep only rows on/after `startInclusive` (YYYY-MM-DD). searchStream dates are
 *  YYYY-MM-DD strings, so a lexical `>=` is a correct calendar comparison. Pure —
 *  the byte-identical guarantee of the Direction-3 shared fetch rests on this: a
 *  400d fetch sliced from the campaign window's start equals the narrower window's
 *  own fetch (both share today's end date within a run). */
export function filterRowsFromDate(rows: SearchRow[], startInclusive: string): SearchRow[] {
  return rows.filter((r) => (r.segments?.date ?? "") >= startInclusive);
}

/** Direction 3 — ONE date-segmented read per account, serving BOTH the monthly
 *  report AND the campaigns period series. The report needs the widest window
 *  (`reportDays`, ~400d); the campaigns series needs only `campaignPeriod` days — a
 *  strict subset. So fetch the report window ONCE (with `campaign.id`, which the
 *  report's per-date sum ignores → its output is byte-identical to the campaign.id-
 *  free {@link fetchAccountDailyRows}) and slice it to the campaign window for the
 *  portfolio + per-campaign series (byte-identical to {@link fetchDailySeriesBundle}
 *  for that period). Halves the linked project's daily-series round-trips on a
 *  report-refresh run. The caller passes the raw report rows to the report mapper. */
export async function fetchAccountDailyShared(
  accessToken: string,
  customerId: string,
  reportDays: number,
  campaignPeriod: CampaignPeriod,
  timeZone?: string | null
): Promise<{ reportRows: SearchRow[]; bundle: DailySeriesBundle }> {
  const digits = customerId.replace(/\D/g, "");
  const reportRows = await fetchAccountDailyRaw(accessToken, digits, reportDays, ["campaign.id"], timeZone);
  // Slice the report window down to the campaign window (both end today within a run —
  // the same tz-aware `end`, so the slice boundary stays consistent with the fetch).
  const { start } = dateRange(CAMPAIGN_PERIOD_DAYS[campaignPeriod], timeZone);
  const periodRows = filterRowsFromDate(reportRows, start);
  return {
    reportRows,
    bundle: { portfolio: mapRowsToDailySeries(periodRows), perCampaign: mapRowsToCampaignDailySeries(periodRows) },
  };
}

const CHANNEL_TYPE: Record<string, CampaignType> = {
  SEARCH: "search",
  PERFORMANCE_MAX: "performance_max",
  SHOPPING: "shopping",
  DISPLAY: "display",
  DEMAND_GEN: "demand_gen",
  VIDEO: "video",
};

/** Channel types we have already logged as unmapped, so a big account with many
 *  such campaigns warns once per process rather than per row. */
const warnedUnmappedChannelTypes = new Set<string>();

/** Map a Google `advertising_channel_type` enum to a CampaignType. Anything outside
 *  the mapped set (HOTEL, LOCAL, SMART, TRAVEL, legacy MULTI_CHANNEL, or a future
 *  enum) becomes the explicit `"other"` bucket — NEVER silently coerced to "search",
 *  which would inflate Search totals and judge them by the strict performance lens.
 *  The first sighting of each new enum is logged once so it can be mapped deliberately. */
export function toCampaignType(channelType: string | undefined): CampaignType {
  const key = channelType ?? "";
  const mapped = CHANNEL_TYPE[key];
  if (mapped) return mapped;
  if (key && !warnedUnmappedChannelTypes.has(key)) {
    warnedUnmappedChannelTypes.add(key);
    console.warn(`[google/ads] unmapped advertising_channel_type "${key}" → "other"`);
  }
  return "other";
}

function toStatus(s: string | undefined): CampaignStatus {
  return s === "ENABLED" ? "enabled" : "paused";
}

function num(v: string | number | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Today's calendar date (YYYY-MM-DD) in an IANA time zone. Google Ads `segments.date`
 *  is expressed in the ACCOUNT's time zone, so a UTC "today" can name the wrong edge
 *  day for a non-UTC account — a US account late in the UTC day is still on yesterday
 *  locally; an Asia/Pacific account early in the UTC day is already on tomorrow. When
 *  `timeZone` is absent or not a resolvable IANA zone, falls back to UTC, byte-identical
 *  to the old `toISOString().slice(0,10)`. Pure — no I/O, tested at the calendar edges. */
export function todayInTimeZone(timeZone?: string | null, now: Date = new Date()): string {
  if (timeZone) {
    try {
      // en-CA renders as YYYY-MM-DD; the timeZone option re-expresses the same instant
      // in the account's local calendar — exactly the day segments.date is keyed on.
      return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
    } catch {
      // Unknown/invalid zone → UTC fallback; a bad tz string must never fail a sync.
    }
  }
  return now.toISOString().slice(0, 10);
}

/** Shift a YYYY-MM-DD calendar date back `days` days, staying on the calendar. The date
 *  is a wall-clock day, so epoch math on its UTC midnight is exact — no DST or tz drift
 *  (a DST transition changes clock times, never which calendar date is `days` before
 *  another). Pure. */
export function shiftCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - days * 86_400_000).toISOString().slice(0, 10);
}

/** GAQL date window [start, end] for the trailing `days`. `end` is today in the
 *  ACCOUNT's time zone when known (so the edge days align with segments.date), UTC
 *  otherwise; `start` is `days` calendar days earlier. With no tz this is byte-identical
 *  to the old UTC computation (`end` = today-UTC, `start` = today − days). */
function dateRange(days: number, timeZone?: string | null): { start: string; end: string } {
  const end = todayInTimeZone(timeZone);
  return { start: shiftCalendarDays(end, days), end };
}

/** The account's IANA time zone from a searchStream result (one value per account, so
 *  the first row that carries it wins), or null when the query didn't select/return it.
 *  Captured at ingestion and persisted additively so later syncs can window in the
 *  account's own clock. */
export function pickTimeZone(rows: SearchRow[]): string | null {
  return rows.find((r) => r.customer?.timeZone)?.customer?.timeZone ?? null;
}

/** The account's ISO-4217 currency code from a searchStream result (one value per
 *  account, so the first row that carries it wins), or null when the query didn't
 *  select/return it. Captured at ingestion beside {@link pickTimeZone} so the report's
 *  money surfaces can label a non-CZK account in its own currency (no conversion). */
export function pickCurrency(rows: SearchRow[]): string | null {
  return rows.find((r) => r.customer?.currencyCode)?.customer?.currencyCode ?? null;
}

/** Campaigns + aggregated metrics for the period, mapped into the app's model, plus
 *  the account's ISO currency code (`customer.currency_code`) AND its IANA time zone
 *  (`customer.time_zone`), both captured at ingestion in this one query: currency lets
 *  the money surfaces label a non-CZK account honestly (no conversion); the time zone
 *  is persisted additively so the NEXT sync can compute its window in the account's own
 *  clock. `timeZone` (the last-known account zone from the prior sync's meta) windows
 *  THIS fetch — null on the first-ever sync → UTC fallback, unchanged. */
export async function fetchCampaigns(
  accessToken: string,
  customerId: string,
  period: CampaignPeriod,
  timeZone?: string | null
): Promise<{ campaigns: Campaign[]; currency: string | null; timeZone: string | null }> {
  const { start, end } = dateRange(CAMPAIGN_PERIOD_DAYS[period], timeZone);
  // No segments.date in SELECT → metrics aggregate per campaign over the range.
  // customer.currency_code + customer.time_zone ride along (one value per account) so the
  // connector can persist both on the sync meta without a second query.
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      customer.currency_code,
      customer.time_zone,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status != 'REMOVED'
  `;
  const rows = await searchStream(accessToken, customerId, query);

  const currency = rows.find((r) => r.customer?.currencyCode)?.customer?.currencyCode ?? null;
  const accountTimeZone = pickTimeZone(rows);

  const campaigns = rows
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
        type: toCampaignType(c.advertisingChannelType),
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

  return { campaigns, currency, timeZone: accountTimeZone };
}
