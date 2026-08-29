/** Pure assembly of the campaigns page payload — the stale-report detection and
 *  the non-active-period meta rewrite — split out of the route's `loadState` so
 *  the exact RESPONSE SHAPE (and these two rules) can be unit-tested without a
 *  Firestore round-trip. `loadState` does the I/O (one tenant-root read + a
 *  parallel batch of independent reads), then hands the fetched pieces here. */
import { hashEvalInputs, type SyncMeta } from "@/lib/campaigns/store";
import type { CampaignReport, ReportHistoryPoint } from "@/lib/ai-types";
import type { SnapshotSummaryPoint } from "@/lib/campaigns/triage";
import type {
  AdsSource,
  Campaign,
  CampaignPeriod,
  ChangesSummary,
  DailyPoint,
} from "@/lib/campaigns/types";

export interface CampaignsStateInputs {
  meta: SyncMeta | null;
  period: CampaignPeriod | undefined;
  campaigns: Campaign[];
  changes: ChangesSummary | null;
  reports: Record<string, CampaignReport>;
  inputHashes: Record<string, string | null>;
  histories: Record<string, ReportHistoryPoint[]>;
  series: DailyPoint[];
  campaignSeries: Record<string, DailyPoint[]>;
  snapshotSummaries: SnapshotSummaryPoint[];
}

/** ADR-0010 — one section of a UNION read: what a single per-account tenant
 *  contributed to the payload. Present only on a multi-tenant project, so a
 *  single-source response never grows a key. */
export interface CampaignsSourceMeta {
  /** the tenant's OWN recorded source when it has synced (a Google tenant whose
   *  last sync degraded honestly says "sample"), else the precedence label
   *  `resolveProjectTenants` gave it */
  source: AdsSource;
  meta: SyncMeta | null;
  /** how many rows of the merged `campaigns` came from this tenant */
  campaigns: number;
  /** the section's ISO-4217 currency, when its account reported one */
  currency?: string;
  /** campaign ids this section had to yield to an earlier (higher-precedence)
   *  one when merging reports / histories / series. 0 in the normal case; a
   *  non-zero count is reported, never silently repaired — change-sets reference
   *  the ids, so renaming one would break the mutation surfaces. */
  collisions: number;
}

export interface CampaignsState {
  campaigns: Campaign[];
  meta: SyncMeta | null;
  reports: Record<string, CampaignReport>;
  staleKeys: string[];
  histories: Record<string, ReportHistoryPoint[]>;
  changes: ChangesSummary | null;
  series: DailyPoint[];
  campaignSeries: Record<string, DailyPoint[]>;
  snapshotSummaries: SnapshotSummaryPoint[];
  /** ADR-0010 — one entry per per-account tenant the project reads. PRESENT ONLY
   *  when the project resolved to more than one tenant; a single-source project's
   *  payload is byte-identical to the pre-ADR-0010 one (pinned by
   *  test-unit/campaigns-state-shape.test.mjs, which asserts the exact key set). */
  sources?: CampaignsSourceMeta[];
  /** the sections disagree on currency → `series` is the PRIMARY tenant's alone
   *  and the client shows per-source totals instead of a fabricated sum. Mirrors
   *  `src/lib/report-metrics/blend.ts`. Present only alongside `sources`. */
  mixedCurrency?: boolean;
}

export function assembleCampaignsState(inp: CampaignsStateInputs): CampaignsState {
  const {
    meta,
    period,
    campaigns,
    changes,
    reports,
    inputHashes,
    histories,
    series,
    campaignSeries,
    snapshotSummaries,
  } = inp;

  // A report is stale when its stored input fingerprint no longer matches the
  // data on screen — i.e. a later sync changed the metrics it was based on, so
  // its score/recommendations may mislead. Reports predating input hashing
  // (null hash) can't be compared and are not flagged (no false alarms).
  // The current hash folds in the sync diff exactly like the analyze route, so
  // a fresh report is never flagged stale by hash-recipe mismatch.
  const staleKeys =
    meta && period
      ? Object.keys(reports).filter((key) => {
          const stored = inputHashes[key];
          if (!stored) return false;
          const current =
            key === "overall"
              ? hashEvalInputs("overall", null, period, campaigns, changes?.current ?? null)
              : hashEvalInputs("campaign", key, period, campaigns, changes?.current ?? null);
          return stored !== current;
        })
      : [];

  // When serving a non-active period's stored state, the meta the client sees
  // must describe THAT period (and its own sync age), not the active pointer.
  const metaOut =
    meta && period && period !== meta.period
      ? { ...meta, period, syncedAt: meta.syncedByPeriod?.[period] ?? meta.syncedAt }
      : meta;

  return {
    campaigns,
    meta: metaOut,
    reports,
    staleKeys,
    histories,
    changes,
    series,
    campaignSeries,
    snapshotSummaries,
  };
}

// ---------------------------------------------------------------------------
// ADR-0010 — the UNION read
// ---------------------------------------------------------------------------

/** One per-account tenant's contribution to a project-level read. */
export interface CampaignsStatePart {
  /** the source `resolveProjectTenants` labelled the tenant with */
  source: AdsSource;
  inputs: CampaignsStateInputs;
}

/** What an un-labelled account's amounts are denominated in — the sync converts
 *  nothing, and "absent" has always meant CZK (same rule as report-metrics/blend). */
const BASE_CURRENCY = "CZK";

const EMPTY_INPUTS: CampaignsStateInputs = {
  meta: null,
  period: undefined,
  campaigns: [],
  changes: null,
  reports: {},
  inputHashes: {},
  histories: {},
  series: [],
  campaignSeries: {},
  snapshotSummaries: [],
};

function currencyCode(meta: SyncMeta | null): string {
  const raw = meta?.currency?.trim().toUpperCase();
  return raw && raw.length > 0 ? raw : BASE_CURRENCY;
}

/** Sum daily portfolio points across sections, keyed by date. Only ever called
 *  when every section shares a currency — summing across currencies would
 *  fabricate a total, which is the one thing ADR-0010 forbids. The optional
 *  clicks/impressions spine is summed only over the points that carry it, so a
 *  legacy series never turns another section's real clicks into zeros. */
function sumDailySeries(sections: DailyPoint[][]): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>();
  for (const series of sections) {
    for (const p of series) {
      const cur = byDate.get(p.date);
      if (!cur) {
        byDate.set(p.date, { ...p });
        continue;
      }
      cur.cost += p.cost;
      cur.conversions += p.conversions;
      cur.conversionValue += p.conversionValue;
      if (typeof p.clicks === "number") cur.clicks = (cur.clicks ?? 0) + p.clicks;
      if (typeof p.impressions === "number") {
        cur.impressions = (cur.impressions ?? 0) + p.impressions;
      }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * ADR-0010 — assemble ONE payload from the project's per-account tenants, in
 * precedence order (Google first, then Sklik — `resolveProjectTenants`).
 *
 * A single-source project is byte-identical to {@link assembleCampaignsState}
 * on that one tenant's inputs: the union of one tenant is that tenant, and NO
 * key is added (the response-shape test pins the exact key set). Only a project
 * that actually resolved to two tenants grows `sources` + `mixedCurrency`.
 *
 * The merge rules, all of which keep the PRIMARY (first) tenant authoritative:
 *  - `campaigns` — concatenated in precedence order, each row tagged with its
 *    own tenant's source (the store's `listCampaignsForProject` rule).
 *  - `reports` / `histories` / `campaignSeries` — merged by key, primary wins;
 *    a campaign id a later section had to yield is counted in its
 *    `sources[i].collisions` and reported, never renamed (change-sets reference
 *    those ids).
 *  - `series` — summed per day ONLY when every section shares a currency; a
 *    mixed-currency project serves the primary's series alone and says so.
 *  - `changes` / `snapshotSummaries` — primary only: they feed the mutation
 *    surfaces, and a union READ must not be mistaken for a union WRITE
 *    (ADR-0010 "Consequences").
 *  - `meta` — the primary's, unchanged semantics; `staleKeys` — the union.
 */
export function assembleProjectCampaignsState(parts: CampaignsStatePart[]): CampaignsState {
  // The union of one tenant IS that tenant — same function, same output, no
  // added keys. Zero tenants cannot happen (resolveProjectTenants always yields
  // at least one) but degrades to an empty payload rather than throwing.
  if (parts.length <= 1) return assembleCampaignsState(parts[0]?.inputs ?? EMPTY_INPUTS);

  const sections = parts.map((part) => ({ part, state: assembleCampaignsState(part.inputs) }));
  const primary = sections[0]!;

  const campaigns: Campaign[] = [];
  const reports: Record<string, CampaignReport> = {};
  const histories: Record<string, ReportHistoryPoint[]> = {};
  const campaignSeries: Record<string, DailyPoint[]> = {};
  const staleKeys: string[] = [];
  const seenCampaignIds = new Set<string>();
  const sources: CampaignsSourceMeta[] = [];

  for (const { part, state } of sections) {
    // The tenant's OWN recorded source wins over the precedence label: a tenant
    // whose last sync degraded to sample data says "sample", and that is the
    // honest tag for its rows (mirrors listCampaignsForProject).
    const source = (state.meta?.source as AdsSource | undefined) ?? part.source;
    let collisions = 0;
    for (const c of state.campaigns) {
      if (seenCampaignIds.has(c.id)) collisions++;
      else seenCampaignIds.add(c.id);
      campaigns.push(c.source ? c : { ...c, source });
    }
    for (const [key, report] of Object.entries(state.reports)) {
      if (!(key in reports)) reports[key] = report;
    }
    for (const [key, history] of Object.entries(state.histories)) {
      if (!(key in histories)) histories[key] = history;
    }
    for (const [key, points] of Object.entries(state.campaignSeries)) {
      if (!(key in campaignSeries)) campaignSeries[key] = points;
    }
    for (const key of state.staleKeys) if (!staleKeys.includes(key)) staleKeys.push(key);
    sources.push({
      source,
      meta: state.meta,
      campaigns: state.campaigns.length,
      ...(state.meta?.currency ? { currency: state.meta.currency } : {}),
      collisions,
    });
  }

  // Never sum across currencies (ADR-0010 §3 / report-metrics blend rule 3).
  const mixedCurrency = new Set(sections.map(({ state }) => currencyCode(state.meta))).size > 1;

  return {
    campaigns,
    meta: primary.state.meta,
    reports,
    staleKeys,
    histories,
    // Primary only — the change diff and the snapshot health timeline feed the
    // mutation surfaces, which stay single-tenant.
    changes: primary.state.changes,
    series: mixedCurrency
      ? primary.state.series
      : sumDailySeries(sections.map(({ state }) => state.series)),
    campaignSeries,
    snapshotSummaries: primary.state.snapshotSummaries,
    sources,
    mixedCurrency,
  };
}
