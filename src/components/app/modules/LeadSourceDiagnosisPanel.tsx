"use client";

/** Client-only "AI diagnóza zdroje" panel co-located with the server-rendered
 *  LeadQualityModule. Receives a lightweight projection of the under-performing
 *  (junk / weak) sources — REAL computed metrics only — lets the user pick one and
 *  asks the shared /api/ai "lead-source-diagnosis" tool WHY it under-performs
 *  (spam vs mis-targeting vs pricing/fit) plus the one concrete action, via the
 *  shared server-usable request builder. A produced diagnosis is PERSISTED per
 *  project (Direction 1): the latest renders on module load, carries a status
 *  lifecycle and a deep-link handoff to the campaigns surface, and the capped
 *  history lists below. */
import { useEffect, useRef, useState } from "react";
import { Pill, type PillTone } from "@/components/ui";
import { Bulb, Funnel, Sparkles, Target } from "@/components/icons";
import {
  leadSourceCauseLabel,
  type LeadSourceCause,
  type LeadSourceDiagnosisResult,
  type LeadSourceSeverity,
} from "@/lib/ai-types";
import { type LeadSourceSeed } from "@/lib/diagnoses/lead-source-request";
import { digestFreshness, type StoredDiagnosis } from "@/lib/diagnoses/types";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAiTool } from "@/components/ai/useAiTool";
import { useDiagnosisPersistence } from "@/components/ai/useDiagnosisPersistence";
import { AiPanelHeader, AiRunButton, AiToolPanel } from "@/components/ai/AiToolPanel";
import { DiagnosisActions, DiagnosisHistory, DiagnosisSampleNote } from "@/components/ai/DiagnosisTracking";

export type { LeadSourceSeed };

const T = {
  cs: {
    panelTitle: "AI diagnóza zdroje",
    panelDesc: "Model dostane jen spočítaná čísla zdroje a pojmenuje příčinu, proč podvýkonný (spam, špatné cílení, nebo cena), i konkrétní akci. Nevymýšlí žádné hodnoty.",
    selectAriaLabel: "Vyberte zdroj k diagnostice",
    diagBtn: "AI diagnóza",
    runningBtn: "Analyzuji…",
    idleHint: "Vyberte podvýkonný zdroj a klikněte na „AI diagnóza“ — model přečte jeho čísla a určí, proč nevýkonný a kde začít. Funguje i bez API klíče v ukázkovém režimu.",
    diagMeta: "Diagnóza zdroje „{source}“ · míra kvalifikace {qualRate} · win rate {winRate}{cpql} · {leads} leadů.",
    cpqlPart: " · CPQL {value}",
    likelyCauseLabel: "Pravděpodobná příčina:",
    recommendedAction: "Doporučená akce",
    dataDisclaimer: "Diagnóza vychází jen z předaných čísel zdroje — model žádná data nedoplňuje.",
    severityHigh: "Vysoká závažnost",
    severityMedium: "Střední závažnost",
    severityLow: "Nízká závažnost",
    handoff: "Otevřít kampaně",
  },
  en: {
    panelTitle: "AI source diagnosis",
    panelDesc: "The model receives only the computed source numbers and names the cause of under-performance (spam, mis-targeting, or pricing) plus the one concrete action. It invents no values.",
    selectAriaLabel: "Select source to diagnose",
    diagBtn: "AI diagnosis",
    runningBtn: "Analysing…",
    idleHint: "Select an under-performing source and click “AI diagnosis” — the model will read its numbers and determine why it under-performs and where to start. Works without an API key in demo mode.",
    diagMeta: "Diagnosis for source “{source}” · qualification rate {qualRate} · win rate {winRate}{cpql} · {leads} leads.",
    cpqlPart: " · CPQL {value}",
    likelyCauseLabel: "Likely cause:",
    recommendedAction: "Recommended action",
    dataDisclaimer: "Diagnosis is based solely on the numbers provided — the model adds no data.",
    severityHigh: "High severity",
    severityMedium: "Medium severity",
    severityLow: "Low severity",
    handoff: "Open campaigns",
  },
} as const;

const CAUSE_TONE: Record<LeadSourceCause, PillTone> = {
  spam: "negative",
  "mis-targeting": "coral",
  pricing: "coral",
  volume: "neutral",
  ok: "positive",
};

const SEVERITY_TONE: Record<LeadSourceSeverity, PillTone> = {
  high: "negative",
  medium: "coral",
  low: "neutral",
};

export default function LeadSourceDiagnosisPanel({
  seeds,
  projectId,
  initialDiagnosis = null,
  history = [],
  currentDigests,
}: {
  seeds: LeadSourceSeed[];
  projectId?: string;
  initialDiagnosis?: StoredDiagnosis | null;
  history?: StoredDiagnosis[];
  /** Direction 2: per-source digest of the CURRENT seed request, keyed by source
   *  name (the diagnosis subject), so an older stored diagnosis is badged stale */
  currentDigests?: Record<string, string>;
}) {
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();
  const tool = useAiTool<LeadSourceDiagnosisResult>("lead-source-diagnosis");
  const { status, run, reset, data } = tool;
  const [selectedSource, setSelectedSource] = useState(seeds[0]?.source ?? "");
  const selected = seeds.find((s) => s.source === selectedSource) ?? seeds[0];

  const persistence = useDiagnosisPersistence(projectId, "lead-source", initialDiagnosis, history);
  const { active, persist, patchStatus } = persistence;

  // Auto-persist a freshly-run diagnosis — gated so the tool's localStorage restore
  // (also status "done" on mount) is never re-saved. See LtvDiagnosisPanel. The digest
  // of the SERVER-rebuilt request rides the result meta (Direction 1).
  const ranThisSession = useRef(false);
  const pendingSubject = useRef("");
  const lastData = useRef<unknown>(null);
  useEffect(() => {
    if (status === "done" && data && ranThisSession.current && data !== lastData.current) {
      lastData.current = data;
      void persist(data.result, data.meta?.inputDigest ?? "", pendingSubject.current);
    }
  }, [status, data, persist]);

  const handoff = { href: projectId ? `/app/${projectId}/kampane` : "/app", label: t("handoff") };
  const activeLead = active && active.kind === "lead-source" ? active : null;
  // Direction 2: a stored diagnosis is stale when its source's current seed digest
  // differs (per-source, keyed by the diagnosis subject = the source name).
  const isStale = (d: StoredDiagnosis) => {
    const cur = currentDigests?.[d.subject];
    return cur ? digestFreshness(d.inputDigest, cur) === "stale" : false;
  };

  const resultBody = (r: LeadSourceDiagnosisResult) => (
    <>
      <DiagnosisSampleNote sample={data?.meta?.sampleGrounded ?? false} />
      {selected && (
        <p className="text-xs text-muted">
          {t("diagMeta", {
            source: selected.source,
            qualRate: fmt.fmtPct(selected.qualRate),
            winRate: fmt.fmtPct(selected.winRate),
            cpql:
              selected.costPerQualified != null
                ? t("cpqlPart", { value: fmt.fmtCZK(selected.costPerQualified) })
                : "",
            leads: fmt.fmtInt(selected.leads),
          })}
        </p>
      )}

      <div className="rounded-card border border-navy-200 bg-navy-50 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-onyx text-brand-400">
            <Funnel width={18} height={18} />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-navy-700">{t("likelyCauseLabel")}</span>
              <Pill tone={CAUSE_TONE[r.likelyCause]}>{leadSourceCauseLabel(r.likelyCause, locale)}</Pill>
              {r.severity && (
                <Pill tone={SEVERITY_TONE[r.severity]}>
                  {r.severity === "high"
                    ? t("severityHigh")
                    : r.severity === "medium"
                      ? t("severityMedium")
                      : t("severityLow")}
                </Pill>
              )}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-navy-700">{r.summary}</p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-card border border-line bg-canvas px-4 py-3.5">
        <Bulb width={18} height={18} className="mt-0.5 shrink-0 text-positive" />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("recommendedAction")}</p>
          <p className="mt-1 text-sm leading-relaxed text-navy-700">{r.recommendation}</p>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-muted">
        <Target width={14} height={14} className="mt-0.5 shrink-0 text-brand-600" />
        <span className="leading-relaxed">{t("dataDisclaimer")}</span>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <AiToolPanel<LeadSourceDiagnosisResult>
        tool={tool}
        idleHint={t("idleHint")}
        initial={
          status === "idle" && activeLead
            ? {
                result: activeLead.result,
                below: (
                  <DiagnosisActions
                    diagnosis={activeLead}
                    onStatus={patchStatus}
                    handoff={handoff}
                    stale={isStale(activeLead)}
                  />
                ),
              }
            : null
        }
        resultFooter={
          activeLead ? (
            <DiagnosisActions
              diagnosis={activeLead}
              onStatus={patchStatus}
              handoff={handoff}
              stale={isStale(activeLead)}
            />
          ) : null
        }
        header={
          <AiPanelHeader icon={Sparkles} title={t("panelTitle")} description={t("panelDesc")}>
            <div className="flex items-center gap-2">
              {seeds.length > 1 && (
                <select
                  value={selectedSource}
                  onChange={(e) => {
                    setSelectedSource(e.target.value);
                    // Clear the previous source's diagnosis — otherwise the result body
                    // (cause/summary/recommendation for source A) stays rendered while the
                    // meta line above relabels it with the newly-selected source B.
                    reset();
                  }}
                  disabled={status === "loading"}
                  aria-label={t("selectAriaLabel")}
                  className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {seeds.map((s) => (
                    <option key={s.source} value={s.source}>
                      {s.source}
                    </option>
                  ))}
                </select>
              )}
              <AiRunButton
                onClick={() => {
                  if (status === "loading" || !selected) return;
                  // Direction 1: send only the picked source (intent) — the server
                  // re-derives that source's real metrics from the funnel.
                  pendingSubject.current = selected.source;
                  ranThisSession.current = true;
                  run(projectId ? { projectId, source: selected.source } : { source: selected.source });
                }}
                loading={status === "loading"}
                disabled={status === "loading" || !selected}
                idleLabel={t("diagBtn")}
                loadingLabel={t("runningBtn")}
              />
            </div>
          </AiPanelHeader>
        }
        renderResult={(r) => resultBody(r)}
      />
      <DiagnosisHistory items={persistence.history} onStatus={patchStatus} isStale={isStale} />
    </div>
  );
}
