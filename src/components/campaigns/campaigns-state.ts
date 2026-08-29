"use client";

/** The campaigns console's CLIENT-side payload model: the shapes `GET/POST
 *  /api/campaigns` returns, and the two pure normalizers that turn a raw response
 *  into render-safe state. Split out of `useCampaigns` so the hook is lifecycle
 *  only (fetch / sync / analyze) and the shape — which SyncProvenance, CampaignTable
 *  and the source filter all read — has one home. No hooks, no JSX. */
import type { CampaignReport, CampaignReportResult, ReportHistoryPoint } from "@/lib/ai-types";
import type { SnapshotSummaryPoint } from "@/lib/campaigns/triage";
import type {
  AdsSource,
  Campaign,
  CampaignPeriod,
  ChangesSummary,
  DailyPoint,
} from "@/lib/campaigns/types";

/** Coerce the analyze response into a safe CampaignReport before it reaches the
 *  render tree. The route returns structured output, but a partial/trimmed payload
 *  (missing arrays, a non-numeric score) would otherwise crash ReportView, which
 *  maps over result.strengths/weaknesses/recommendations unconditionally. */
export function normalizeReport(raw: unknown): CampaignReport {
  const rep = (raw ?? {}) as CampaignReport;
  const res = (rep.result ?? {}) as Partial<CampaignReportResult>;
  return {
    ...rep,
    result: {
      verdict: typeof res.verdict === "string" ? res.verdict : "",
      score:
        typeof res.score === "number" && Number.isFinite(res.score)
          ? Math.max(0, Math.min(100, res.score))
          : 0,
      summary: typeof res.summary === "string" ? res.summary : "",
      strengths: Array.isArray(res.strengths) ? res.strengths : [],
      weaknesses: Array.isArray(res.weaknesses) ? res.weaknesses : [],
      recommendations: Array.isArray(res.recommendations) ? res.recommendations : [],
    },
  };
}

/** ADR-0010 — one section of a UNION read: what a single per-account tenant
 *  contributed. Declared here rather than imported from the route's `state.ts`,
 *  which reaches the server-only campaign store. */
export interface CampaignsSourceMeta {
  source: AdsSource;
  meta: { source: string; syncedAt: string; degraded?: boolean; currency?: string } | null;
  /** how many of the merged rows came from this tenant */
  campaigns: number;
  currency?: string;
  /** campaign ids this section yielded to a higher-precedence one */
  collisions?: number;
}

export interface CampaignsMeta {
  source: string;
  period: CampaignPeriod;
  syncedAt: string;
  /** the account's ISO-4217 currency (Direction 2). Absent → the base CZK, so money
   *  surfaces render exactly as before; a non-CZK code relabels the amounts honestly
   *  (no conversion). */
  currency?: string;
  /** the Sklik money-unit verdict (Direction 3): "halere-suspected" surfaces the
   *  provenance confirm affordance. Absent for Google / sample. */
  moneyVerdict?: "czk-plausible" | "halere-suspected" | "insufficient-data";
  /** the last sync's live fetch fell back to sample data — the UI shows a
   *  truth-in-labeling warning instead of presenting demo numbers as live */
  degraded?: boolean;
  /** error summary behind the fallback (a describeError string) — surfaced in the
   *  provenance popover so "why am I seeing sample data?" is answerable */
  degradedReason?: string | null;
  /** when each period was last actually synced — powers the provenance popover's
   *  per-period coverage + stale distinction. Already persisted in SyncMeta and
   *  returned by the API, so exposing it needs no new fetch. */
  syncedByPeriod?: Record<string, string>;
  /** ADR-0010 — one entry per per-account tenant the project reads (Google first,
   *  then Sklik), lifted here off the response's top level so every consumer of
   *  `meta` can tell a union apart from a single source. ABSENT for a single-source
   *  project, which is what the badge / filter / per-source provenance lines key
   *  off: no key, no new UI. */
  sources?: CampaignsSourceMeta[];
  /** the project's sections disagree on currency, so `series` is the primary
   *  tenant's alone and portfolio money totals must be shown per source rather than
   *  summed. Present only alongside `sources`. */
  mixedCurrency?: boolean;
}

export interface CampaignsState {
  campaigns: Campaign[];
  meta: CampaignsMeta | null;
  reports: Record<string, CampaignReport>;
  /** report keys ("overall" or campaign id) whose stored evaluation was made on
   *  data that a later sync changed — the UI badges them as stale */
  staleKeys: string[];
  /** full score history per key ("overall" or campaign id), oldest → newest */
  histories: Record<string, ReportHistoryPoint[]>;
  /** what changed since the prior sync (null until ≥2 syncs exist) */
  changes: ChangesSummary | null;
  /** per-campaign daily series (campaign id → points) for the table sparklines */
  campaignSeries: Record<string, DailyPoint[]>;
  /** rule-based triage per stored sync snapshot — the deterministic health
   *  timeline (one point per sync, oldest → newest) */
  snapshotSummaries: SnapshotSummaryPoint[];
}

export const EMPTY_STATE: CampaignsState = {
  campaigns: [],
  meta: null,
  reports: {},
  staleKeys: [],
  histories: {},
  changes: null,
  campaignSeries: {},
  snapshotSummaries: [],
};

/** The wire payload. ADR-0010's `sources` / `mixedCurrency` live at the TOP LEVEL
 *  of the response and only for a project that resolved to more than one tenant. */
export type CampaignsPayload = Partial<CampaignsState> & {
  sources?: CampaignsSourceMeta[];
  mixedCurrency?: boolean;
};

/** Normalize one response into client state. Shared by the initial load and the
 *  sync so the two can never drift, and the single place the union's top-level
 *  `sources`/`mixedCurrency` are folded onto `meta` — a single-source project
 *  sends neither, so its `meta` is untouched and no union UI appears. */
export function readCampaignsState(json: CampaignsPayload): CampaignsState {
  const meta = json.meta ?? null;
  return {
    campaigns: json.campaigns ?? [],
    meta:
      meta && json.sources
        ? { ...meta, sources: json.sources, mixedCurrency: Boolean(json.mixedCurrency) }
        : meta,
    reports: json.reports ?? {},
    staleKeys: json.staleKeys ?? [],
    histories: json.histories ?? {},
    changes: json.changes ?? null,
    campaignSeries: json.campaignSeries ?? {},
    snapshotSummaries: json.snapshotSummaries ?? [],
  };
}
