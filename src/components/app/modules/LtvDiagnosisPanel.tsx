"use client";

/** Client-only "AI rozbor kohort" panel co-located with the server-rendered
 *  LtvModule. Receives the already-computed cohort rows + summary as props, maps
 *  them into the cohort-diagnosis request (REAL numbers only — the model invents
 *  nothing), and calls the shared /api/ai tool. The request is built lazily on
 *  click (no work during render) so the parent stays a pure server component.
 *  Renders the diagnosis / worst cohort / recommendation with the module's
 *  card + pill styling, plus loading / error / timeout / demo states. */
import { Bulb, Sparkles, Target, TrendDown } from "@/components/icons";
import type {
  CohortDiagnosisCohort,
  CohortDiagnosisRequest,
  CohortDiagnosisResult,
} from "@/lib/ai-types";
import type { CohortMetrics, LtvSummary, TrendDirection } from "@/lib/ltv/compute";
import { cohortTrend } from "@/lib/ltv/compute";
import { useAiTool } from "@/components/ai/useAiTool";
import { AiPanelHeader, AiRunButton, AiToolPanel } from "@/components/ai/AiToolPanel";
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
  },
} as const;

/** Project a computed cohort row down to the real numbers the model needs —
 *  including the per-channel breakdown and the retention/survival curve the panel
 *  used to drop, so the diagnosis can point at the channel and read the decay
 *  shape rather than only the headline ratio + M3. */
function toDiagnosisCohort(r: CohortMetrics): CohortDiagnosisCohort {
  const cohort: CohortDiagnosisCohort = {
    month: r.month,
    cac: r.cac,
    ltv: r.ltv,
    ltvCac: r.ltvCac,
    paybackMonth: r.paybackMonth,
    m3: r.m3,
    signups: r.signups,
    survival: r.survival,
    observedMonths: r.observedMonths,
  };
  if (r.channelMetrics.length > 0) {
    cohort.channels = r.channelMetrics.map((m) => ({
      channel: m.channel,
      cac: m.cac,
      ltvCac: m.ltvCac,
      paid: m.paid,
      signups: m.signups,
    }));
  }
  return cohort;
}

/** Build the request from props at click time (never during render). */
function buildRequest(
  rows: CohortMetrics[],
  summary: LtvSummary,
  eshop: boolean
): CohortDiagnosisRequest {
  const trend: TrendDirection | undefined = cohortTrend(rows)?.direction;
  const req: CohortDiagnosisRequest = {
    cohorts: rows.map(toDiagnosisCohort),
    blendedCac: summary.blendedCac,
    avgLtvCac: summary.avgLtvCac,
    avgPayback: summary.avgPayback,
  };
  if (trend) req.trend = trend;
  if (eshop) req.eshop = true;
  return req;
}

export default function LtvDiagnosisPanel({
  rows,
  summary,
  eshop = false,
}: {
  rows: CohortMetrics[];
  summary: LtvSummary;
  /** e-shop project → customer / repeat-purchase framing in the AI diagnosis */
  eshop?: boolean;
}) {
  const t = useT(T);
  const tool = useAiTool<CohortDiagnosisResult>("cohort-diagnosis");
  const { status, run } = tool;

  return (
    <AiToolPanel<CohortDiagnosisResult>
      tool={tool}
      idleHint={t("idleHint")}
      header={
        <AiPanelHeader icon={Sparkles} title={t("panelTitle")} description={t("panelDesc")}>
          <AiRunButton
            onClick={() =>
              status !== "loading" &&
              rows.length > 0 &&
              run(buildRequest(rows, summary, eshop) as unknown as Record<string, unknown>)
            }
            loading={status === "loading"}
            disabled={status === "loading" || rows.length === 0}
            idleLabel={t("runBtn")}
            loadingLabel={t("runningBtn")}
          />
        </AiPanelHeader>
      }
      renderResult={(r) => (
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
      )}
    />
  );
}
