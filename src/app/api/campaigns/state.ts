/** Pure assembly of the campaigns page payload — the stale-report detection and
 *  the non-active-period meta rewrite — split out of the route's `loadState` so
 *  the exact RESPONSE SHAPE (and these two rules) can be unit-tested without a
 *  Firestore round-trip. `loadState` does the I/O (one tenant-root read + a
 *  parallel batch of independent reads), then hands the fetched pieces here. */
import { hashEvalInputs, type SyncMeta } from "@/lib/campaigns/store";
import type { CampaignReport, ReportHistoryPoint } from "@/lib/ai-types";
import type { SnapshotSummaryPoint } from "@/lib/campaigns/triage";
import type { Campaign, CampaignPeriod, ChangesSummary, DailyPoint } from "@/lib/campaigns/types";

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
