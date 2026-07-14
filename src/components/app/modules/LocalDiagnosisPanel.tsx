"use client";

/** Client-only "Lokální diagnóza" panel co-located with the server-rendered
 *  LocalModule. Receives the already-built local-diagnosis request (REAL, resolved
 *  figures only — the model invents nothing) as a prop and calls the shared /api/ai
 *  tool. A produced diagnosis is PERSISTED per project (kind "local"): the latest
 *  renders on module load, carries a status lifecycle + a deep-link handoff to the
 *  coverage gaps, and the capped history lists below. Mirrors LtvDiagnosisPanel. */
import { useEffect, useRef } from "react";
import { Bulb, Pin, Sparkles, Target, TrendDown } from "@/components/icons";
import type { LocalDiagnosisRequest, LocalDiagnosisResult } from "@/lib/ai-types";
import { inputDigest, type StoredDiagnosis } from "@/lib/diagnoses/types";
import { useAiTool } from "@/components/ai/useAiTool";
import { useDiagnosisPersistence } from "@/components/ai/useDiagnosisPersistence";
import { AiPanelHeader, AiRunButton, AiToolPanel } from "@/components/ai/AiToolPanel";
import { DiagnosisActions, DiagnosisHistory } from "@/components/ai/DiagnosisTracking";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    panelTitle: "Lokální diagnóza",
    panelDesc: "Model dostane jen spočítaná čísla lokální viditelnosti (pokrytí, mezery, pozice, recenze) a určí, kterou mezeru uzavřít první a co udělat. Nevymýšlí žádné hodnoty.",
    runBtn: "Spustit diagnózu",
    runningBtn: "Analyzuji…",
    idleHint: "Klikněte na „Spustit diagnózu“ a model přečte pokrytí, pozice a recenze výše — doporučí, kde začít. Funguje i bez API klíče v ukázkovém režimu.",
    worstGapLabel: "Uzavřít jako první:",
    fixFirstLabel: "Řešit jako první",
    risksTitle: "Na co si dát pozor",
    handoff: "Zobrazit mezery",
  },
  en: {
    panelTitle: "Local diagnosis",
    panelDesc: "The model receives only the computed local-visibility numbers (coverage, gaps, positions, reviews) and names the gap to close first and what to do. It invents no values.",
    runBtn: "Run diagnosis",
    runningBtn: "Analysing…",
    idleHint: "Click “Run diagnosis” and the model will read the coverage, positions and reviews above — it will recommend where to start. Works without an API key in demo mode.",
    worstGapLabel: "Close first:",
    fixFirstLabel: "Fix first",
    risksTitle: "Watch out for",
    handoff: "View gaps",
  },
} as const;

function LocalResultBody({ r, t }: { r: LocalDiagnosisResult; t: (k: keyof (typeof T)["cs"]) => string }) {
  return (
    <>
      <div className="rounded-card border border-navy-200 bg-navy-50 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-onyx text-brand-400">
            <Target width={18} height={18} />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-navy-700">{t("worstGapLabel")}</span>
              <span className="pill bg-coral-soft text-coral-600">
                <Pin width={13} height={13} />
                {r.worstGap}
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

export default function LocalDiagnosisPanel({
  request,
  projectId,
  initialDiagnosis = null,
  history = [],
}: {
  /** the prebuilt local-diagnosis request (resolved figures only) */
  request: LocalDiagnosisRequest;
  /** the project the diagnosis persists under */
  projectId?: string;
  /** the latest persisted local diagnosis (renders on load) */
  initialDiagnosis?: StoredDiagnosis | null;
  /** the capped local-diagnosis history */
  history?: StoredDiagnosis[];
}) {
  const t = useT(T);
  const tool = useAiTool<LocalDiagnosisResult>("local-diagnosis");
  const { status, run, data } = tool;
  const persistence = useDiagnosisPersistence(projectId, "local", initialDiagnosis, history);
  const { active, persist, patchStatus } = persistence;

  // Auto-persist a freshly-run diagnosis (see LtvDiagnosisPanel for the gating).
  const ranThisSession = useRef(false);
  const pendingDigest = useRef("");
  const lastData = useRef<unknown>(null);
  useEffect(() => {
    if (status === "done" && data && ranThisSession.current && data !== lastData.current) {
      lastData.current = data;
      void persist(data.result, pendingDigest.current, data.result.worstGap);
    }
  }, [status, data, persist]);

  const handoff = { href: "#local-gaps", label: t("handoff") };
  const activeLocal = active && active.kind === "local" ? active : null;
  const hasGaps = request.gaps.length > 0;

  return (
    <div className="space-y-4">
      <AiToolPanel<LocalDiagnosisResult>
        tool={tool}
        idleHint={t("idleHint")}
        initial={
          status === "idle" && activeLocal
            ? {
                result: activeLocal.result,
                below: (
                  <DiagnosisActions diagnosis={activeLocal} onStatus={patchStatus} handoff={handoff} />
                ),
              }
            : null
        }
        resultFooter={
          activeLocal ? (
            <DiagnosisActions diagnosis={activeLocal} onStatus={patchStatus} handoff={handoff} />
          ) : null
        }
        header={
          <AiPanelHeader icon={Sparkles} title={t("panelTitle")} description={t("panelDesc")}>
            <AiRunButton
              onClick={() => {
                if (status === "loading" || !hasGaps) return;
                pendingDigest.current = inputDigest(request);
                ranThisSession.current = true;
                run(request as unknown as Record<string, unknown>);
              }}
              loading={status === "loading"}
              disabled={status === "loading" || !hasGaps}
              idleLabel={t("runBtn")}
              loadingLabel={t("runningBtn")}
            />
          </AiPanelHeader>
        }
        renderResult={(r) => <LocalResultBody r={r} t={t} />}
      />
      <DiagnosisHistory items={persistence.history} onStatus={patchStatus} />
    </div>
  );
}
