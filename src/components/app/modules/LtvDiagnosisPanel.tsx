"use client";

/** Client-only "AI rozbor kohort" panel co-located with the server-rendered
 *  LtvModule. Receives the already-computed cohort rows + summary as props, maps
 *  them into the cohort-diagnosis request (REAL numbers only — the model invents
 *  nothing) via the shared server-usable builder, and calls the shared /api/ai
 *  tool. The request is built lazily on click (no work during render) so the parent
 *  stays a pure server component. A produced diagnosis is PERSISTED per project
 *  (Direction 1): the latest renders on module load, carries a status lifecycle and
 *  a deep-link handoff, and the capped history lists below. Renders the diagnosis /
 *  worst cohort / recommendation with the module's card + pill styling. */
import { useEffect, useRef } from "react";
import { Bulb, Sparkles, Target, TrendDown } from "@/components/icons";
import type { CohortDiagnosisResult } from "@/lib/ai-types";
import type { CohortMetrics } from "@/lib/ltv/compute";
import { digestFreshness, type StoredDiagnosis } from "@/lib/diagnoses/types";
import { useAiTool } from "@/components/ai/useAiTool";
import { useDiagnosisPersistence } from "@/components/ai/useDiagnosisPersistence";
import { AiPanelHeader, AiRunButton, AiToolPanel } from "@/components/ai/AiToolPanel";
import { DiagnosisActions, DiagnosisHistory, DiagnosisSampleNote } from "@/components/ai/DiagnosisTracking";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    panelTitle: "AI rozbor kohort",
    panelDesc: "Model dostane jen spočítaná čísla kohort a pojmenuje problémovou kohortu i páku, kterou řešit jako první. Nevymýšlí žádné hodnoty.",
    runBtn: "Spustit rozbor",
    runningBtn: "Analyzuji…",
    idleHint: "Klikněte na „Spustit rozbor“ a model přečte jednotkovou ekonomiku kohort výše — doporučí, kde začít. Funguje i bez API klíče v ukázkovém režimu.",
    worstCohortLabel: "Problémová kohorta:",
    fixFirstLabel: "Řešit jako první",
    risksTitle: "Na co si dát pozor",
    handoff: "Zobrazit kohorty",
  },
  en: {
    panelTitle: "AI cohort analysis",
    panelDesc: "The model receives only the computed cohort numbers and names the problem cohort and the first lever to pull. It invents no values.",
    runBtn: "Run analysis",
    runningBtn: "Analysing…",
    idleHint: "Click “Run analysis” and the model will read the unit economics above — it will recommend where to start. Works without an API key in demo mode.",
    worstCohortLabel: "Problem cohort:",
    fixFirstLabel: "Fix first",
    risksTitle: "Watch out for",
    handoff: "View cohorts",
  },
} as const;

function CohortResultBody({ r, t }: { r: CohortDiagnosisResult; t: (k: keyof (typeof T)["cs"]) => string }) {
  return (
    <>
      <div className="rounded-card border border-navy-200 bg-navy-50 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-onyx text-brand-400">
            <Target width={18} height={18} />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-navy-700">{t("worstCohortLabel")}</span>
              <span className="pill bg-coral-soft text-coral-600">
                <TrendDown width={13} height={13} />
                {r.worstCohort}
              </span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-navy-700">{r.summary}</p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-card border border-line bg-canvas px-4 py-3.5">
        <Bulb width={18} height={18} className="mt-0.5 shrink-0 text-positive" />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("fixFirstLabel")}</p>
          <p className="mt-1 text-sm leading-relaxed text-navy-700">{r.recommendation}</p>
        </div>
      </div>

      {r.risks && r.risks.length > 0 && (
        <div>
          <p className="mb-2.5 text-sm font-semibold text-navy-800">{t("risksTitle")}</p>
          <ul className="space-y-2.5">
            {r.risks.map((risk, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-navy-700">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-coral-soft text-coral-600">
                  <TrendDown width={12} height={12} />
                </span>
                <span className="leading-snug">{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export default function LtvDiagnosisPanel({
  rows,
  projectId,
  initialDiagnosis = null,
  history = [],
  currentDigest,
}: {
  /** the computed cohort rows — used only to gate the run (empty → nothing to
   *  diagnose); the diagnosed economics are re-derived server-side (Direction 1) */
  rows: CohortMetrics[];
  /** the project the diagnosis persists under + the server re-derives from */
  projectId?: string;
  /** the latest persisted cohort diagnosis (renders on load) */
  initialDiagnosis?: StoredDiagnosis | null;
  /** the capped cohort-diagnosis history */
  history?: StoredDiagnosis[];
  /** Direction 2: the digest of the CURRENT cohort request (server-computed), so a
   *  stored diagnosis computed from older data is badged stale */
  currentDigest?: string;
}) {
  const t = useT(T);
  const tool = useAiTool<CohortDiagnosisResult>("cohort-diagnosis");
  const { status, run, data } = tool;
  const persistence = useDiagnosisPersistence(projectId, "cohort", initialDiagnosis, history);
  const { active, persist, patchStatus } = persistence;

  // Auto-persist a freshly-run diagnosis. `ranThisSession` gates out the tool's
  // localStorage restore (which also lands as status "done" on mount) so a restored
  // result is never re-saved; the digest of the SERVER-rebuilt request rides the
  // result meta (Direction 1); `lastData` dedupes the same AiResponse object.
  const ranThisSession = useRef(false);
  const lastData = useRef<unknown>(null);
  useEffect(() => {
    if (status === "done" && data && ranThisSession.current && data !== lastData.current) {
      lastData.current = data;
      void persist(data.result, data.meta?.inputDigest ?? "", data.result.worstCohort);
    }
  }, [status, data, persist]);

  const handoff = { href: "#ltv-kohorty", label: t("handoff") };
  const activeCohort = active && active.kind === "cohort" ? active : null;
  // Direction 2: a stored diagnosis is stale when its input digest no longer matches
  // the current data digest (backward-tolerant — an old-format digest reads as
  // unknown-age, never a hard stale claim).
  const isStale = (d: StoredDiagnosis) =>
    currentDigest ? digestFreshness(d.inputDigest, currentDigest) === "stale" : false;

  return (
    <div className="space-y-4">
      <AiToolPanel<CohortDiagnosisResult>
        tool={tool}
        idleHint={t("idleHint")}
        initial={
          status === "idle" && activeCohort
            ? {
                result: activeCohort.result,
                below: (
                  <DiagnosisActions
                    diagnosis={activeCohort}
                    onStatus={patchStatus}
                    handoff={handoff}
                    stale={isStale(activeCohort)}
                  />
                ),
              }
            : null
        }
        resultFooter={
          activeCohort ? (
            <DiagnosisActions
              diagnosis={activeCohort}
              onStatus={patchStatus}
              handoff={handoff}
              stale={isStale(activeCohort)}
            />
          ) : null
        }
        header={
          <AiPanelHeader icon={Sparkles} title={t("panelTitle")} description={t("panelDesc")}>
            <AiRunButton
              onClick={() => {
                if (status === "loading" || rows.length === 0) return;
                // Direction 1: send only the tamper-proof intent — the server
                // re-derives the cohort economics from the project. useAiTool injects
                // the active project id; we pass it explicitly when known.
                ranThisSession.current = true;
                run(projectId ? { projectId } : {});
              }}
              loading={status === "loading"}
              disabled={status === "loading" || rows.length === 0}
              idleLabel={t("runBtn")}
              loadingLabel={t("runningBtn")}
            />
          </AiPanelHeader>
        }
        renderResult={(r) => (
          <>
            <DiagnosisSampleNote sample={data?.meta?.sampleGrounded ?? false} />
            <CohortResultBody r={r} t={t} />
          </>
        )}
      />
      <DiagnosisHistory items={persistence.history} onStatus={patchStatus} isStale={isStale} />
    </div>
  );
}
