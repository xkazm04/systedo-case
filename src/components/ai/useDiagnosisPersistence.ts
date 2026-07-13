"use client";

/** Client hook that makes a diagnosis a durable, actionable object: it persists a
 *  freshly-run diagnosis to the per-project store, tracks the capped history and
 *  moves a diagnosis through its status lifecycle (new → acknowledged → resolved).
 *  Shared by LtvDiagnosisPanel and LeadSourceDiagnosisPanel so both behave
 *  identically. Talks to /api/projects/[id]/diagnoses; all mutations are optimistic
 *  with a server round-trip, and a failed round-trip is swallowed (the diagnosis is
 *  still shown from the live result — persistence is additive, never blocking). */
import { useState } from "react";
import {
  capPerKind,
  type DiagnosisKind,
  type DiagnosisStatus,
  type StoredDiagnosis,
} from "@/lib/diagnoses/types";
import type { CohortDiagnosisResult, LeadSourceDiagnosisResult } from "@/lib/ai-types";

type DiagResult = CohortDiagnosisResult | LeadSourceDiagnosisResult;

export interface DiagnosisPersistence {
  /** the newest persisted diagnosis of this kind (what the panel shows on load) */
  active: StoredDiagnosis | null;
  /** the capped history (newest-first) for the strip below the panel */
  history: StoredDiagnosis[];
  /** persist a freshly-run result; no-op when there is no project id */
  persist: (result: DiagResult, inputDigest: string, subject: string) => Promise<void>;
  /** move one diagnosis through its status lifecycle */
  patchStatus: (id: string, status: DiagnosisStatus) => Promise<void>;
}

export function useDiagnosisPersistence(
  projectId: string | undefined,
  kind: DiagnosisKind,
  initialActive: StoredDiagnosis | null,
  initialHistory: StoredDiagnosis[]
): DiagnosisPersistence {
  const [active, setActive] = useState<StoredDiagnosis | null>(initialActive);
  const [history, setHistory] = useState<StoredDiagnosis[]>(initialHistory);

  async function persist(result: DiagResult, digest: string, subject: string) {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/diagnoses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, result, inputDigest: digest, subject, origin: "manual" }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { diagnosis?: StoredDiagnosis };
      const saved = json.diagnosis;
      if (!saved) return;
      setActive(saved);
      // Keep the client view in sync with the server's per-kind cap.
      setHistory((h) => capPerKind([saved, ...h.filter((x) => x.id !== saved.id)]));
    } catch {
      /* persistence is additive — the live result is still shown */
    }
  }

  async function patchStatus(id: string, status: DiagnosisStatus) {
    if (!projectId) return;
    // Optimistic: reflect the new status immediately, roll back on a failed write.
    const apply = (s: DiagnosisStatus) => {
      setHistory((h) => h.map((x) => (x.id === id ? { ...x, status: s } : x)));
      setActive((a) => (a && a.id === id ? { ...a, status: s } : a));
    };
    const prev = history.find((x) => x.id === id)?.status ?? active?.status ?? "new";
    apply(status);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/diagnoses`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) apply(prev);
    } catch {
      apply(prev);
    }
  }

  return { active, history, persist, patchStatus };
}
