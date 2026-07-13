/** Sklik (Seznam's Czech ad platform) wire types + the mapping into this app's
 *  framework-free campaign model. Kept dependency-free (no fetch, no server-only)
 *  so the adapter and its channel-type mapping are unit-testable in isolation.
 *
 *  Sklik is the #1 strategic anchor for the Czech market: many local advertisers
 *  run Sklik alongside — or instead of — Google Ads. This models the DATA-IN
 *  surface only (campaigns + daily stats). Mutations stay Google-only for now. */
import type { CampaignStatus, CampaignType } from "@/lib/campaigns/types";

/** A campaign as returned by `campaigns.list`. Only the fields the connector maps
 *  are typed; the API returns more. Numeric ids (Sklik) are stringified into the
 *  neutral model so Campaign.id stays a string across every provider. */
export interface SklikCampaign {
  id: number;
  name?: string;
  /** serving status — "active" serves, everything else (suspend, …) is paused */
  status?: string;
  /** campaign category, e.g. "fulltext" / "context" / "product" / "video" /
   *  "combined". Absent on older accounts → mapped to the generic "search". */
  type?: string;
  /** daily budget in the account currency (CZK). Sklik money fields are native
   *  CZK — unlike Google Ads micros there is NO 1e6 division. */
  dayBudget?: number;
  /** soft-deleted campaigns are excluded from the synced set */
  deleted?: boolean;
}

/** One row of a `stats.campaigns` report — either a period total (no `date`) or a
 *  single day (`granularity: "daily"`). Money is native CZK (see moneyToCzk). */
export interface SklikStatRow {
  /** YYYY-MM-DD when the report is daily-granular; omitted for a period total */
  date?: string;
  impressions?: number;
  clicks?: number;
  /** spend in the account currency (CZK, native — no micros) */
  money?: number;
  conversions?: number;
  /** value of conversions = attributed revenue, CZK */
  conversionValue?: number;
}

/** Per-campaign stats block inside a `stats.campaigns` report. */
export interface SklikStatsReport {
  campaignId: number;
  stats?: SklikStatRow[];
}

/**
 * Sklik campaign type → this app's advertising-channel type. Sklik's taxonomy
 * differs from Google's, so we normalise onto the shared CampaignType the whole
 * dashboard (by-type breakdown, triage roles, colours) already understands:
 *   - fulltext / search   → search   (textové inzeráty ve vyhledávání)
 *   - context / content   → display  (obsahová síť)
 *   - rtg / retargeting   → display  (retargeting is a display buy)
 *   - product / pla / zbozi → shopping (produktové inzeráty / Zboží.cz)
 *   - video               → video
 *   - combined            → performance_max (kombinovaná kampaň ≈ PMax)
 * Anything unmapped falls back to "search" (the generic, safest default).
 */
export const SKLIK_CHANNEL_TYPE: Record<string, CampaignType> = {
  search: "search",
  fulltext: "search",
  context: "display",
  content: "display",
  rtg: "display",
  retargeting: "display",
  product: "shopping",
  productadvertising: "shopping",
  pla: "shopping",
  zbozi: "shopping",
  video: "video",
  combined: "performance_max",
};

/** Map a Sklik campaign type onto CampaignType (case-insensitive, generic
 *  fallback "search"). */
export function sklikChannelType(type: string | undefined): CampaignType {
  if (!type) return "search";
  return SKLIK_CHANNEL_TYPE[type.toLowerCase()] ?? "search";
}

/** Map a Sklik serving status onto the neutral enabled/paused. Sklik uses
 *  "active" for a serving campaign; suspend / removed / anything else reads as
 *  paused (never mis-flagged as active). */
export function sklikStatus(status: string | undefined): CampaignStatus {
  return status === "active" ? "enabled" : "paused";
}

/**
 * Convert a Sklik money value to CZK. Per the connector decision Sklik money is
 * treated as NATIVE CZK (contrast Google Ads, which reports micros ÷ 1e6). This
 * is centralised as a single seam: should the live API turn out to report money
 * in haléře (1/100 CZK) for a given endpoint, this is the ONE place to divide by
 * 100 — the per-user-credentials follow-up must verify the unit against a real
 * account. Kept identity by default so fixture values map 1:1.
 */
export function moneyToCzk(money: number | undefined): number {
  return Math.round(Number(money ?? 0));
}
