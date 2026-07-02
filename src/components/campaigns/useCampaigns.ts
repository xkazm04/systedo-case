"use client";

import { useCallback, useEffect, useState } from "react";
import { useOptionalProject } from "@/lib/projects/context";
import type { CampaignReport, CampaignReportResult, EvalScope, ReportHistoryPoint } from "@/lib/ai-types";
import type { SnapshotSummaryPoint } from "@/lib/campaigns/triage";
import type {
  Campaign,
  CampaignPeriod,
  ChangesSummary,
  DailyPoint,
} from "@/lib/campaigns/types";

/** Coerce the analyze response into a safe CampaignReport before it reaches the
 *  render tree. The route returns structured output, but a partial/trimmed payload
 *  (missing arrays, a non-numeric score) would otherwise crash ReportView, which
 *  maps over result.strengths/weaknesses/recommendations unconditionally. */
function normalizeReport(raw: unknown): CampaignReport {
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

export interface CampaignsMeta {
  source: string;
  period: CampaignPeriod;
  syncedAt: string;
  /** the last sync's live fetch fell back to sample data — the UI shows a
   *  truth-in-labeling warning instead of presenting demo numbers as live */
  degraded?: boolean;
  /** error summary behind the fallback (diagnostics; not rendered verbatim) */
  degradedReason?: string | null;
}

interface State {
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
  /** per-day portfolio totals for the trend chart */
  series: DailyPoint[];
  /** per-campaign daily series (campaign id → points) for the table sparklines */
  campaignSeries: Record<string, DailyPoint[]>;
  /** rule-based triage per stored sync snapshot — the deterministic health
   *  timeline (one point per sync, oldest → newest) */
  snapshotSummaries: SnapshotSummaryPoint[];
}

const EMPTY: State = {
  campaigns: [],
  meta: null,
  reports: {},
  staleKeys: [],
  histories: {},
  changes: null,
  series: [],
  campaignSeries: {},
  snapshotSummaries: [],
};

/** Client lifecycle for the campaigns page: loads the synced state, re-syncs from
 *  the connector, and runs per-campaign / portfolio AI evaluations. Tracks busy
 *  state per key ("overall" or a campaign id) so each row spins independently. */
export function useCampaigns() {
  const project = useOptionalProject();
  const pid = project?.id;
  const [state, setState] = useState<State>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({});
  const [analyzeErrors, setAnalyzeErrors] = useState<Record<string, string>>({});
  /** per-key: was the last evaluation served from the input-hash cache (no new
   *  paid model call) rather than freshly generated? */
  const [cached, setCached] = useState<Record<string, boolean>>({});
  /** batch "evaluate everything" run state + its result summary */
  const [analyzingAll, setAnalyzingAll] = useState(false);
  const [batchSummary, setBatchSummary] = useState<{
    evaluated: number;
    cached: number;
    remaining: number;
    quotaExhausted: boolean;
    error: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(pid ? `/api/campaigns?projectId=${encodeURIComponent(pid)}` : "/api/campaigns");
      const json = (await res.json()) as State;
      if (!res.ok) throw new Error("load failed");
      setState({
        campaigns: json.campaigns ?? [],
        meta: json.meta ?? null,
        reports: json.reports ?? {},
        staleKeys: json.staleKeys ?? [],
        histories: json.histories ?? {},
        changes: json.changes ?? null,
        series: json.series ?? [],
        campaignSeries: json.campaignSeries ?? {},
        snapshotSummaries: json.snapshotSummaries ?? [],
      });
    } catch {
      setError("Nepodařilo se načíst kampaně.");
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => {
    load();
  }, [load]);

  /** Sync (or serve) one period. `preferStored: true` — the period-toggle path
   *  — lets the server flip to that period's already-stored state instantly
   *  (no connector round-trip, no sync quota) and only falls back to a real
   *  connector sync when the period was never synced. The explicit sync
   *  buttons omit it, so "Synchronizovat" always means a real refresh. */
  const sync = useCallback(async (
    period: CampaignPeriod,
    opts?: { preferStored?: boolean }
  ) => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, projectId: pid, preferStored: Boolean(opts?.preferStored) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Synchronizace se nezdařila.");
        return;
      }
      setState({
        campaigns: json.campaigns ?? [],
        meta: json.meta ?? null,
        reports: json.reports ?? {},
        staleKeys: json.staleKeys ?? [],
        histories: json.histories ?? {},
        changes: json.changes ?? null,
        series: json.series ?? [],
        campaignSeries: json.campaignSeries ?? {},
        snapshotSummaries: json.snapshotSummaries ?? [],
      });
    } catch {
      setError("Nepodařilo se spojit se serverem.");
    } finally {
      setSyncing(false);
    }
  }, [pid]);

  /** Run one evaluation. Resolves `true` on success and `false` on any failure,
   *  so a sequential batch caller (the triage banner's "evaluate all flagged")
   *  can stop at the first error/429 instead of hammering the rate limiter. */
  const analyze = useCallback(
    async (scope: EvalScope, campaignId: string | null, period: CampaignPeriod): Promise<boolean> => {
      const key = scope === "overall" ? "overall" : campaignId ?? "overall";
      setAnalyzing((a) => ({ ...a, [key]: true }));
      setAnalyzeErrors((e) => {
        const { [key]: _drop, ...rest } = e;
        void _drop;
        return rest;
      });
      try {
        const res = await fetch("/api/campaigns/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, campaignId, period, projectId: pid }),
        });
        const json = await res.json();
        if (!res.ok) {
          setAnalyzeErrors((e) => ({ ...e, [key]: json?.error ?? "Vyhodnocení se nezdařilo." }));
          return false;
        }
        setState((s) => ({
          ...s,
          reports: { ...s.reports, [key]: normalizeReport(json.report) },
          // A just-completed evaluation (fresh or cache-hit) matches the current
          // data by construction, so the key can't be stale any more.
          staleKeys: s.staleKeys.filter((k) => k !== key),
          histories: {
            ...s.histories,
            [key]: (json.history as ReportHistoryPoint[]) ?? s.histories[key] ?? [],
          },
        }));
        setCached((cc) => ({ ...cc, [key]: Boolean(json.cached) }));
        return true;
      } catch {
        setAnalyzeErrors((e) => ({ ...e, [key]: "Nepodařilo se spojit se serverem." }));
        return false;
      } finally {
        setAnalyzing((a) => ({ ...a, [key]: false }));
      }
    },
    [pid]
  );

  /** One-request batch: evaluate the portfolio + every campaign server-side,
   *  paying only for targets whose data changed since their stored report (the
   *  input-hash cache). Reloads the full state afterwards so reports, histories
   *  and stale badges refresh in one pass. Signed-in only (the route 401s). */
  const analyzeAll = useCallback(async (): Promise<boolean> => {
    setAnalyzingAll(true);
    setBatchSummary(null);
    try {
      const res = await fetch("/api/campaigns/analyze/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBatchSummary({
          evaluated: 0,
          cached: 0,
          remaining: 0,
          quotaExhausted: false,
          error: json?.error ?? "Hromadné vyhodnocení se nezdařilo.",
        });
        return false;
      }
      setBatchSummary({
        evaluated: json.evaluated?.length ?? 0,
        cached: json.cached?.length ?? 0,
        remaining: json.remaining?.length ?? 0,
        quotaExhausted: Boolean(json.quotaExhausted),
        error: json.error ?? null,
      });
      await load();
      return true;
    } catch {
      setBatchSummary({
        evaluated: 0,
        cached: 0,
        remaining: 0,
        quotaExhausted: false,
        error: "Nepodařilo se spojit se serverem.",
      });
      return false;
    } finally {
      setAnalyzingAll(false);
    }
  }, [pid, load]);

  return {
    campaigns: state.campaigns,
    meta: state.meta,
    reports: state.reports,
    staleKeys: state.staleKeys,
    histories: state.histories,
    changes: state.changes,
    series: state.series,
    campaignSeries: state.campaignSeries,
    snapshotSummaries: state.snapshotSummaries,
    loading,
    syncing,
    error,
    analyzing,
    analyzeErrors,
    cached,
    analyzingAll,
    batchSummary,
    sync,
    analyze,
    analyzeAll,
  };
}
