"use client";

/** Client hook that makes a diagnosis a durable, actionable object: it persists a
 *  freshly-run diagnosis to the per-project store, tracks the capped history and
 *  moves a diagnosis through its status lifecycle (new → acknowledged → resolved).
 *  Shared by the three diagnosis panels so all behave identically. Talks to
 *  /api/projects/[id]/diagnoses; status mutations are optimistic with a server
 *  round-trip.
 *
 *  Direction 3 — persistence no longer swallows failures. A failed save / status
 *  write surfaces a non-silent `saveError` (with the last operation captured for a
 *  one-tap `retry`), so the operator knows the diagnosis they paid quota for did NOT
 *  persist instead of it evaporating quietly. The live result is still shown. */
import { useRef, useState } from "react";
import {
  capPerKind,
  type DiagnosisKind,
  type DiagnosisStatus,
  type StoredDiagnosis,
} from "@/lib/diagnoses/types";
import type { CohortDiagnosisResult, LeadSourceDiagnosisResult, LocalDiagnosisResult } from "@/lib/ai-types";

type DiagResult = CohortDiagnosisResult | LeadSourceDiagnosisResult | LocalDiagnosisResult;

/** Which write failed — the panel maps this to localized copy. `null` = no error. */
export type DiagnosisSaveErrorKind = "save" | "status" | null;

export interface DiagnosisPersistence {
  /** the newest persisted diagnosis of this kind (what the panel shows on load) */
  active: StoredDiagnosis | null;
  /** the capped history (newest-first) for the strip below the panel */
  history: StoredDiagnosis[];
  /** persist a freshly-run result; no-op when there is no project id */
  persist: (result: DiagResult, inputDigest: string, subject: string) => Promise<void>;
  /** move one diagnosis through its status lifecycle */
  patchStatus: (id: string, status: DiagnosisStatus) => Promise<void>;
  /** Direction 3: the last write that failed (null when the last write succeeded) */
  saveError: DiagnosisSaveErrorKind;
  /** re-attempt the last failed write */
  retry: () => void;
  /** dismiss the error note without retrying */
  clearError: () => void;
}

export function useDiagnosisPersistence(
  projectId: string | undefined,
  kind: DiagnosisKind,
  initialActive: StoredDiagnosis | null,
  initialHistory: StoredDiagnosis[]
): DiagnosisPersistence {
  const [active, setActive] = useState<StoredDiagnosis | null>(initialActive);
  const [history, setHistory] = useState<StoredDiagnosis[]>(initialHistory);
  const [saveError, setSaveError] = useState<DiagnosisSaveErrorKind>(null);
  // The exact operation to re-run on retry (captures its own args). Ref, not state —
  // reading it during render is never needed.
  const retryRef = useRef<(() => void) | null>(null);

  async function persist(result: DiagResult, digest: string, subject: string) {
    if (!projectId) return;
    setSaveError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/diagnoses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, result, inputDigest: digest, subject, origin: "manual" }),
      });
      if (!res.ok) throw new Error(`persist failed: ${res.status}`);
      const json = (await res.json()) as { diagnosis?: StoredDiagnosis };
      const saved = json.diagnosis;
      if (!saved) throw new Error("persist failed: no diagnosis in response");
      setActive(saved);
      // Keep the client view in sync with the server's per-kind cap.
      setHistory((h) => capPerKind([saved, ...h.filter((x) => x.id !== saved.id)]));
    } catch {
      // Direction 3: surface it — the operator paid quota for this diagnosis and it
      // did NOT persist. Capture the exact call for a one-tap retry.
      retryRef.current = () => void persist(result, digest, subject);
      setSaveError("save");
    }
  }

  async function patchStatus(id: string, status: DiagnosisStatus) {
    if (!projectId) return;
    setSaveError(null);
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
      if (!res.ok) throw new Error(`status failed: ${res.status}`);
    } catch {
      apply(prev); // roll back the optimistic change
      retryRef.current = () => void patchStatus(id, status);
      setSaveError("status");
    }
  }

  function retry() {
    const fn = retryRef.current;
    retryRef.current = null;
    setSaveError(null);
    fn?.();
  }

  function clearError() {
    retryRef.current = null;
    setSaveError(null);
  }

  return { active, history, persist, patchStatus, saveError, retry, clearError };
}
