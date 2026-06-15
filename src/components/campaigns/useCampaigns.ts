"use client";

import { useCallback, useEffect, useState } from "react";
import type { CampaignReport, EvalScope, ReportHistoryPoint } from "@/lib/ai-types";
import type { Campaign, CampaignPeriod, ChangesSummary } from "@/lib/campaigns/types";

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
}

const EMPTY: State = { campaigns: [], meta: null, reports: {}, histories: {}, changes: null };

/** Client lifecycle for the campaigns page: loads the synced state, re-syncs from
 *  the connector, and runs per-campaign / portfolio AI evaluations. Tracks busy
 *  state per key ("overall" or a campaign id) so each row spins independently. */
export function useCampaigns() {
  const [state, setState] = useState<State>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({});
  const [analyzeErrors, setAnalyzeErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns");
      const json = (await res.json()) as State;
      if (!res.ok) throw new Error("load failed");
      setState({
        campaigns: json.campaigns ?? [],
        meta: json.meta ?? null,
        reports: json.reports ?? {},
        histories: json.histories ?? {},
        changes: json.changes ?? null,
      });
    } catch {
      setError("Nepodařilo se načíst kampaně.");
    } finally {
      setLoading(false);
    }
  }, []);

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
        body: JSON.stringify({ period }),
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
      });
    } catch {
      setError("Nepodařilo se spojit se serverem.");
    } finally {
      setSyncing(false);
    }
  }, []);

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
          body: JSON.stringify({ scope, campaignId, period }),
        });
        const json = await res.json();
        if (!res.ok) {
          setAnalyzeErrors((e) => ({ ...e, [key]: json?.error ?? "Vyhodnocení se nezdařilo." }));
          return;
        }
        setState((s) => ({
          ...s,
          reports: { ...s.reports, [key]: json.report as CampaignReport },
          histories: {
            ...s.histories,
            [key]: (json.history as ReportHistoryPoint[]) ?? s.histories[key] ?? [],
          },
        }));
      } catch {
        setAnalyzeErrors((e) => ({ ...e, [key]: "Nepodařilo se spojit se serverem." }));
      } finally {
        setAnalyzing((a) => ({ ...a, [key]: false }));
      }
    },
    []
  );

  return {
    campaigns: state.campaigns,
    meta: state.meta,
    reports: state.reports,
    histories: state.histories,
    changes: state.changes,
    loading,
    syncing,
    error,
    analyzing,
    analyzeErrors,
    sync,
    analyze,
  };
}
