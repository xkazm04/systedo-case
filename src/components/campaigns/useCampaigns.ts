"use client";

import { useCallback, useEffect, useState } from "react";
import { useOptionalProject } from "@/lib/projects/context";
import type { CampaignReport, CampaignReportResult, EvalScope, ReportHistoryPoint } from "@/lib/ai-types";
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
}

interface State {
  campaigns: Campaign[];
  meta: CampaignsMeta | null;
  reports: Record<string, CampaignReport>;
  /** full score history per key ("overall" or campaign id), oldest → newest */
  histories: Record<string, ReportHistoryPoint[]>;
  /** what changed since the prior sync (null until ≥2 syncs exist) */
  changes: ChangesSummary | null;
  /** per-day portfolio totals for the trend chart */
  series: DailyPoint[];
}

const EMPTY: State = {
  campaigns: [],
  meta: null,
  reports: {},
  histories: {},
  changes: null,
  series: [],
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

  const load = useCallback(async () => {
    try {
      const res = await fetch(pid ? `/api/campaigns?projectId=${encodeURIComponent(pid)}` : "/api/campaigns");
      const json = (await res.json()) as State;
      if (!res.ok) throw new Error("load failed");
      setState({
        campaigns: json.campaigns ?? [],
        meta: json.meta ?? null,
        reports: json.reports ?? {},
        histories: json.histories ?? {},
        changes: json.changes ?? null,
        series: json.series ?? [],
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

  const sync = useCallback(async (period: CampaignPeriod) => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, projectId: pid }),
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
        histories: json.histories ?? {},
        changes: json.changes ?? null,
        series: json.series ?? [],
      });
    } catch {
      setError("Nepodařilo se spojit se serverem.");
    } finally {
      setSyncing(false);
    }
  }, [pid]);

  const analyze = useCallback(
    async (scope: EvalScope, campaignId: string | null, period: CampaignPeriod) => {
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
          return;
        }
        setState((s) => ({
          ...s,
          reports: { ...s.reports, [key]: normalizeReport(json.report) },
          histories: {
            ...s.histories,
            [key]: (json.history as ReportHistoryPoint[]) ?? s.histories[key] ?? [],
          },
        }));
        setCached((cc) => ({ ...cc, [key]: Boolean(json.cached) }));
      } catch {
        setAnalyzeErrors((e) => ({ ...e, [key]: "Nepodařilo se spojit se serverem." }));
      } finally {
        setAnalyzing((a) => ({ ...a, [key]: false }));
      }
    },
    [pid]
  );

  return {
    campaigns: state.campaigns,
    meta: state.meta,
    reports: state.reports,
    histories: state.histories,
    changes: state.changes,
    series: state.series,
    loading,
    syncing,
    error,
    analyzing,
    analyzeErrors,
    cached,
    sync,
    analyze,
  };
}
