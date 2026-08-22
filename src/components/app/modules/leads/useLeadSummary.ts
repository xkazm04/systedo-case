"use client";

/** The aggregate half of the module's data seam: `GET /crm/summary`, one bounded
 *  scan, so the band above a list never has to be computed from the page under it
 *  (which is how a "92 % within SLA" tile ends up describing 25 rows out of 900). */
import { useEffect, useState } from "react";
import type { ContactSummary } from "@/lib/leads/summary";

export interface LeadSummaryState {
  summary: ContactSummary | null;
  live: boolean;
  total: number;
  loading: boolean;
}

export function useLeadSummary(projectId: string, reloadKey = 0): LeadSummaryState {
  const [state, setState] = useState<LeadSummaryState>({
    summary: null,
    live: false,
    total: 0,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/crm/summary`);
        const json = (await res.json()) as {
          ok?: boolean;
          summary?: ContactSummary;
          live?: boolean;
          total?: number;
        };
        if (cancelled) return;
        setState({
          summary: json.summary ?? null,
          live: Boolean(json.live),
          total: json.total ?? 0,
          loading: false,
        });
      } catch {
        if (!cancelled) setState((p) => ({ ...p, loading: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);

  return state;
}
