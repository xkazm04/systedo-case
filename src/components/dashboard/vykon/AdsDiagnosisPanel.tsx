"use client";

/** Client-only "AI diagnóza výkonu reklam" panel for Výkon. Wave 1: a tenant whose
 *  only live data is Ads had no diagnosis at all — the weekly digest knew the lead
 *  arm and exited. This asks the shared /api/ai "ads-diagnosis" tool WHY the paid
 *  portfolio is off target (burned budget, misallocation, drifting efficiency, a
 *  measurement gap, an unbalanced network mix) plus the one concrete action.
 *
 *  The panel sends an INTENT (the project id) only: every number is re-derived
 *  server-side from the campaign union (ADR-0010), so nothing here can alter a
 *  diagnosed figure. A produced diagnosis is persisted per project and carries the
 *  same lifecycle (new → acknowledged → resolved), stale badge and outcome chip the
 *  other diagnosis panels use — for ads the tracked metric is portfolio PNO, where
 *  LOWER is better (compareOutcome inverts exactly that key). The reading itself
 *  lives in ./AdsDiagnosisReading; this file owns only run / persist / lifecycle. */
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "@/components/icons";
import type { AdsDiagnosisResult } from "@/lib/ai-types";
import { digestFreshness, type StoredDiagnosis } from "@/lib/diagnoses/types";
import { alreadyResolvedUnchanged, compareOutcome } from "@/lib/diagnoses/outcome";
import { useT } from "@/lib/i18n/client";
import { useAiTool } from "@/components/ai/useAiTool";
import { useDiagnosisPersistence } from "@/components/ai/useDiagnosisPersistence";
import { AiPanelHeader, AiRunButton, AiToolPanel } from "@/components/ai/AiToolPanel";
import {
  DiagnosisActions,
  DiagnosisAlreadyResolvedNote,
  DiagnosisHistory,
  DiagnosisSampleNote,
  DiagnosisSaveError,
} from "@/components/ai/DiagnosisTracking";
import AdsDiagnosisReading from "./AdsDiagnosisReading";

const T = {
  cs: {
    panelTitle: "AI diagnóza výkonu reklam",
    panelDesc:
      "Model dostane jen spočítaná čísla vašich kampaní (Google Ads i Sklik) a pojmenuje hlavní důvod, proč portfolio nedosahuje cíle, i konkrétní akci. Nevymýšlí žádné hodnoty.",
    diagBtn: "AI diagnóza",
    runningBtn: "Analyzuji…",
    idleHint:
      "Vyberte „AI diagnóza“. Model přečte čísla vašich kampaní za posledních 30 dní a určí, kde se pálí rozpočet a kde začít. Funguje i bez API klíče v ukázkovém režimu.",
    handoff: "Otevřít kampaně",
  },
  en: {
    panelTitle: "AI ads performance diagnosis",
    panelDesc:
      "The model receives only the computed numbers of your campaigns (Google Ads and Sklik) and names the main reason the portfolio is off target, plus the one concrete action. It invents no values.",
    diagBtn: "AI diagnosis",
    runningBtn: "Analyzing…",
    idleHint:
      "Select “AI diagnosis”. The model reads your campaign numbers for the last 30 days and determines where budget is burning and where to start. Works without an API key in demo mode.",
    handoff: "Open campaigns",
  },
} as const;

export default function AdsDiagnosisPanel({
  projectId,
  initialDiagnosis = null,
  history = [],
  currentDigest,
  currentPno,
}: {
  projectId?: string;
  initialDiagnosis?: StoredDiagnosis | null;
  history?: StoredDiagnosis[];
  /** digest of the CURRENT server-rebuilt request, so an older stored diagnosis is
   *  badged stale. The diagnosis is portfolio-wide, so ONE digest covers every row. */
  currentDigest?: string;
  /** the portfolio's CURRENT PNO — the metric an ads diagnosis is about. Undefined
   *  (no resolvable portfolio) → no outcome chip, never a fabricated comparison. */
  currentPno?: number;
}) {
  const t = useT(T);
  const tool = useAiTool<AdsDiagnosisResult>("ads-diagnosis");
  const { status, run, data } = tool;

  const persistence = useDiagnosisPersistence(projectId, "ads", initialDiagnosis, history);
  const { active, persist, patchStatus, saveError, retry, clearError } = persistence;

  // Auto-persist a freshly-run diagnosis — gated so the tool's localStorage restore
  // (also status "done" on mount) is never re-saved. See LeadSourceDiagnosisPanel.
  const ranThisSession = useRef(false);
  const lastData = useRef<unknown>(null);
  const [freshSubject, setFreshSubject] = useState<string | null>(null);
  useEffect(() => {
    if (status === "done" && data && ranThisSession.current && data !== lastData.current) {
      lastData.current = data;
      // The subject of a PORTFOLIO diagnosis is the cause it settled on — the same
      // subject the digest writer stores, so the "already resolved, unchanged" note
      // matches across the passive and the on-demand path. Echoed from the result;
      // the client never authors one.
      const subject = data.result.likelyCause;
      setFreshSubject(subject);
      // SEAM REQUEST (outside this work package's write set): `useDiagnosisPersistence`
      // still types its payload as the THREE pre-Wave-1 result unions, while the store,
      // the wire sanitizer and DiagnosisState are all already kind-keyed and accept
      // "ads". Widening that one alias to the exported `DiagnosisResult`
      // (@/lib/diagnoses/types) deletes this bridge. Type-only: the value shipped is the
      // ads result the route just returned, and the server re-sanitizes it BY KIND.
      const payload = data.result as unknown as Parameters<typeof persist>[0];
      void persist(payload, data.meta?.inputDigest ?? "", subject, data.meta?.snapshot);
    }
  }, [status, data, persist]);

  const handoff = { href: projectId ? `/app/${projectId}/kampane` : "/app", label: t("handoff") };
  const activeAds = active && active.kind === "ads" ? active : null;
  const isStale = (d: StoredDiagnosis) =>
    currentDigest ? digestFreshness(d.inputDigest, currentDigest) === "stale" : false;
  // Portfolio-wide, so the current metric is the SAME for every stored record — no
  // per-subject lookup (and no chip at all when no portfolio resolves).
  const currentFor = () => currentPno;
  const outcomeOf = (d: StoredDiagnosis) =>
    d.status === "resolved" ? compareOutcome(d.snapshot, currentPno) : null;
  const alreadyResolvedNote =
    status === "done" && freshSubject
      ? alreadyResolvedUnchanged(persistence.history, "ads", freshSubject, currentFor)
      : false;

  const actionsFor = (d: StoredDiagnosis) => (
    <DiagnosisActions
      diagnosis={d}
      onStatus={patchStatus}
      handoff={handoff}
      stale={isStale(d)}
      outcome={outcomeOf(d)}
    />
  );

  return (
    <div className="space-y-4">
      <AiToolPanel<AdsDiagnosisResult>
        tool={tool}
        idleHint={t("idleHint")}
        initial={
          status === "idle" && activeAds
            ? { result: activeAds.result, below: actionsFor(activeAds) }
            : null
        }
        resultFooter={activeAds ? actionsFor(activeAds) : null}
        header={
          <AiPanelHeader icon={Sparkles} title={t("panelTitle")} description={t("panelDesc")}>
            <AiRunButton
              onClick={() => {
                if (status === "loading" || !projectId) return;
                ranThisSession.current = true;
                run({ projectId });
              }}
              loading={status === "loading"}
              disabled={status === "loading" || !projectId}
              idleLabel={t("diagBtn")}
              loadingLabel={t("runningBtn")}
            />
          </AiPanelHeader>
        }
        renderResult={(r) => (
          <>
            <DiagnosisAlreadyResolvedNote show={alreadyResolvedNote} />
            <DiagnosisSampleNote sample={data?.meta?.sampleGrounded ?? false} />
            <AdsDiagnosisReading result={r} />
          </>
        )}
      />
      <DiagnosisSaveError error={saveError} onRetry={retry} onDismiss={clearError} />
      <DiagnosisHistory
        items={persistence.history}
        onStatus={patchStatus}
        isStale={isStale}
        outcomeOf={outcomeOf}
      />
    </div>
  );
}
