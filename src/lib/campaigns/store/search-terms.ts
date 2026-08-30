/** WP S1b — the tenant's SEARCH-TERM store (server-only): the account's top search
 *  queries for one period, one small doc per period, on the same `tenantStore()`
 *  document seam the daily-series store uses (Firestore in prod, the node:sqlite
 *  `campaign_docs` twin under LOCAL_DB).
 *
 *  WHY A STORE AT ALL: a negative keyword is a permanent, account-changing write.
 *  Recommending one from a number nobody can read back afterwards would make the
 *  proposal unauditable — so the terms the recommender scored are persisted first
 *  and the console reads exactly what the recommender read.
 *
 *  Two rules, both load-bearing:
 *   1. WHOLE-DOC OVERWRITE ONLY ON SUCCESS. Same contract as the series store: a
 *      failed or empty fetch leaves the last good terms in place rather than
 *      blanking the panel (see the sync join in ../sync.ts).
 *   2. NOTHING SAMPLE EVER LANDS HERE. The sync gate refuses to write on a degraded
 *      (sample-fallback) fetch, and the sample connector answers `[]`. A negative
 *      keyword mined from demo data would be a real account change justified by a
 *      number that was never the account's. */
import "server-only";
import { activePeriod, type TenantRoot } from "./tenant";
import { tenantStore } from "./backend";
import { searchTermsDocId } from "../store-keys";
import type { CampaignPeriod } from "../types";

/** The sub-collection under `tenants/{tenant}` these docs live in. */
const SEARCH_TERMS = "searchTerms";

/** How a query matched the keyword that served it. `OTHER` is the honest bucket for
 *  anything outside the three Google reports on `segments.keyword.info.match_type`
 *  (and for a row that carries no match type at all) — never silently coerced to
 *  BROAD, which would make an unmatched row eligible for a promote. */
export type SearchTermMatchType = "EXACT" | "PHRASE" | "BROAD" | "OTHER";

/** One search query's period totals, in the account's own currency (already
 *  micros→units at the mapper, like every other money field in this app). */
export interface SearchTermRow {
  term: string;
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  matchType: SearchTermMatchType;
  cost: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversionValue: number;
}

export interface SearchTermsDoc {
  period: CampaignPeriod;
  syncedAt: string;
  rows: SearchTermRow[];
}

/** Hard cap on the rows one period's doc may hold. The GAQL read already asks for
 *  the 500 costliest terms; this is the store-side guarantee that a provider which
 *  ignores the LIMIT can never push a multi-megabyte document at Firestore. */
export const SEARCH_TERMS_CAP = 500;

/** The rows actually persisted: costliest first, capped. Pure — the cap is applied
 *  BY COST, so what falls off the end is always the cheapest tail, never an
 *  arbitrary slice of whatever order the provider happened to return. */
export function capSearchTerms(rows: SearchTermRow[]): SearchTermRow[] {
  return [...rows].sort((a, b) => b.cost - a.cost).slice(0, SEARCH_TERMS_CAP);
}

/** Replace the tenant's stored search terms for one period. Callers must only
 *  reach this after a genuinely live, non-degraded fetch (see ../sync.ts). */
export async function saveSearchTerms(
  tenant: string,
  rows: SearchTermRow[],
  meta: { period: CampaignPeriod }
): Promise<void> {
  const doc: SearchTermsDoc = {
    period: meta.period,
    syncedAt: new Date().toISOString(),
    rows: capSearchTerms(rows),
  };
  await (await tenantStore()).setDoc(tenant, SEARCH_TERMS, searchTermsDocId(meta.period), doc);
}

/** The tenant's stored search terms for `period` (defaults to the active period),
 *  costliest first, or []. No legacy fallback: the collection is new, so a missing
 *  doc means "never synced under this period", which is exactly []. */
export async function getSearchTerms(
  tenant: string,
  period?: CampaignPeriod,
  root?: TenantRoot
): Promise<SearchTermRow[]> {
  const requested = period ?? (await activePeriod(tenant, root));
  if (!requested) return [];
  const data = await (await tenantStore()).getDoc(tenant, SEARCH_TERMS, searchTermsDocId(requested));
  return Array.isArray(data?.rows) ? (data!.rows as SearchTermRow[]) : [];
}
