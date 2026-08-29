"use client";

import { useCallback, useEffect, useState } from "react";
import { useOptionalProject } from "@/lib/projects/context";
import { serverErrorOr, rawError, type CampaignError } from "./errors";
import {
  EMPTY_STATE,
  normalizeReport,
  readCampaignsState,
  type CampaignsPayload,
  type CampaignsState,
} from "./campaigns-state";
import type { EvalScope, ReportHistoryPoint } from "@/lib/ai-types";
import type { CampaignPeriod } from "@/lib/campaigns/types";

export type { CampaignsMeta, CampaignsSourceMeta } from "./campaigns-state";

/** Client lifecycle for the campaigns page: loads the synced state, re-syncs from
 *  the connector, and runs per-campaign / portfolio AI evaluations. Tracks busy
 *  state per key ("overall" or a campaign id) so each row spins independently. */
export function useCampaigns() {
  const project = useOptionalProject();
  const pid = project?.id;
  const [state, setState] = useState<CampaignsState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<CampaignError | null>(null);
  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({});
  const [analyzeErrors, setAnalyzeErrors] = useState<Record<string, CampaignError>>({});
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
    error: CampaignError | null;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(pid ? `/api/campaigns?projectId=${encodeURIComponent(pid)}` : "/api/campaigns");
      const json = (await res.json()) as CampaignsPayload;
      if (!res.ok) throw new Error("load failed");
      setState(readCampaignsState(json));
    } catch {
      setError({ key: "loadFailed" });
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
        setError(serverErrorOr(json?.error, "syncFailed"));
        return;
      }
      setState(readCampaignsState(json as CampaignsPayload));
    } catch {
      setError({ key: "serverError" });
    } finally {
      setSyncing(false);
    }
  }, [pid]);

  /** Run one evaluation. Resolves `true` on success and `false` on any failure,
   *  so a sequential batch caller (the triage banner's "evaluate all flagged")
   *  can stop at the first error/429 instead of hammering the rate limiter. */
  const analyze = useCallback(
    async (
      scope: EvalScope,
      campaignId: string | null,
      period: CampaignPeriod,
      // Direction 3: an optional re-run steer. It reaches the eval prompt and bypasses
      // the report cache (a steered re-run must not be served the previous report).
      refine?: string
    ): Promise<boolean> => {
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
          body: JSON.stringify({ scope, campaignId, period, projectId: pid, ...(refine ? { refine } : {}) }),
        });
        const json = await res.json();
        if (!res.ok) {
          setAnalyzeErrors((e) => ({ ...e, [key]: serverErrorOr(json?.error, "analyzeFailed") }));
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
        setAnalyzeErrors((e) => ({ ...e, [key]: { key: "serverError" } }));
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
          error: serverErrorOr(json?.error, "batchFailed"),
        });
        return false;
      }
      const evaluated: string[] = json.evaluated ?? [];
      const cachedKeys: string[] = json.cached ?? [];
      setBatchSummary({
        evaluated: evaluated.length,
        cached: cachedKeys.length,
        remaining: json.remaining?.length ?? 0,
        quotaExhausted: Boolean(json.quotaExhausted),
        error: json.error ? rawError(json.error) : null,
      });
      // A just-evaluated or cache-hit target matches the current data by
      // construction, so it can't be stale any more — drop those keys from the
      // stale set directly (mirrors the single-analyze splice at line ~200)
      // instead of a blind full reload. The batch route's response carries only
      // key lists (evaluated/cached/remaining), NOT the report bodies, so fresh
      // reports still need one fetch — but only when there actually are new ones;
      // an all-cached / nothing-new run now costs no round-trip.
      const doneKeys = new Set([...evaluated, ...cachedKeys]);
      setState((s) => ({ ...s, staleKeys: s.staleKeys.filter((k) => !doneKeys.has(k)) }));
      if (evaluated.length > 0) await load();
      return true;
    } catch {
      setBatchSummary({
        evaluated: 0,
        cached: 0,
        remaining: 0,
        quotaExhausted: false,
        error: { key: "serverError" },
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
