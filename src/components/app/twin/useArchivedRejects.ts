"use client";

/** The project's archived REJECTS, fetched once so the rejection tally can consider
 *  history too — otherwise `rejectionPatterns` would forget every "no" the moment
 *  the draft aged out of the hot blob into the archive, and the twin would start
 *  repeating mistakes it had already been taught to avoid.
 *
 *  Bounded (the route caps the read) and best-effort: a demo project, an unowned
 *  project, or any store hiccup simply yields `[]`, and the tally falls back to the
 *  hot blob alone — the same graceful-degradation contract `useTwinState` uses. The
 *  list only ever contains rejected drafts, so folding it into the tally never
 *  touches the outbox history or the readiness score. */
import { useEffect, useState } from "react";
import type { TwinDraft } from "@/lib/twin/types";

export function useArchivedRejects(projectId: string): TwinDraft[] {
  const [rejects, setRejects] = useState<TwinDraft[]>([]);
  useEffect(() => {
    let active = true;
    void fetch(`/api/projects/${projectId}/twin`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (active && json && Array.isArray(json.rejects)) setRejects(json.rejects as TwinDraft[]);
      })
      .catch(() => {
        /* offline / demo — the tally runs on the hot blob alone */
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  return rejects;
}
