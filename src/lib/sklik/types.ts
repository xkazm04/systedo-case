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

/** One keyword suggestion as returned by Sklik's keyword-suggestion surface. Only the
 *  fields the adapter maps are typed; the API returns more (and the exact names are
 *  offline-unverifiable — see sklik/keywords.ts, the single documented mapping seam).
 *  All metric fields are OPTIONAL: a suggestion may carry only the phrase, in which case
 *  the adapter fills conservative defaults. */
export interface SklikKeywordSuggestion {
  /** the suggested search phrase */
  keyword?: string;
  /** average monthly searches, when the surface provides it */
  searchCount?: number;
  /** average / suggested CPC in the account currency — unit handled by moneyToCzk */
  avgCpc?: number;
  /** competition/competitiveness, 0–1 or 0–100 (the adapter normalises defensively) */
  competition?: number;
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

/** How a connection's confirmed money-unit setting maps Sklik money onto CZK:
 *  "czk" = native (the default, current behaviour); "halere" = divide by 100, used
 *  only AFTER the owner confirms the Direction-3 haléře verdict. */
export type SklikMoneyMode = "czk" | "halere";

/**
 * Convert a Sklik money value to CZK. Per the connector decision Sklik money is
 * treated as NATIVE CZK by default (contrast Google Ads, which reports micros ÷ 1e6).
 * This is the ONE documented conversion seam: when a connection's owner has CONFIRMED
 * the haléře verdict (Direction 3), the connector passes `mode: "halere"` and this
 * divides by 100. It NEVER converts silently — an unconfirmed account stays on the
 * "czk" default, so fixture values (and every existing caller) map 1:1.
 */
export function moneyToCzk(money: number | undefined, mode: SklikMoneyMode = "czk"): number {
  const raw = Number(money ?? 0);
  return Math.round(mode === "halere" ? raw / 100 : raw);
}
