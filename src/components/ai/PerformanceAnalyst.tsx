"use client";

import { useState } from "react";
import Link from "next/link";
import { Bolt, Check, Download, Gauge, Target, TrendDown } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { downloadText } from "@/lib/export";
import {
  analysisPeriodLabel,
  ANALYSIS_PERIODS,
  type AnalysisPeriod,
  type AnalysisResult,
} from "@/lib/ai-types";
import { useAiTool } from "./useAiTool";
import {
  Group,
  LoadingTimer,
  PromptDisclosure,
  ResultMeta,
  TimeoutState,
  ToolEmpty,
  ToolError,
} from "./primitives";

const T = {
  cs: {
    formHeading: "Analýza výkonu",
    periodLabel: "Období",
    submitAnalyzing: "Analyzuji…",
    submitAnalyze: "Analyzovat data",
    dataNote: "Nástroj interpretuje stejná (ilustrativní) data klienta Mionelo, jaká vidíš v",
    dataNoteLink: "dashboardu",
    dataNoteSuffix: ". Model dostává jen reálná čísla a nesmí si žádná vymýšlet.",
    emptyTitle: "Analýza výkonu se zobrazí tady",
    emptyBody: "Vyber období a nech Gemini sestavit shrnutí výkonu, co se daří, kde jsou rizika a jaké další kroky dávají smysl — to vše na základě reálných čísel z dashboardu.",
    emptyHint: "Tip: vyber období a klikni na Analyzovat data.",
    groupWins: "Co se daří",
    groupRisks: "Na co si dát pozor",
    groupActions: "Doporučené kroky",
    copyWins: "\nCO SE DAŘÍ:",
    copyRisks: "\nNA CO SI DÁT POZOR:",
    copyActions: "\nDOPORUČENÉ KROKY:",
    downloadAnalysis: "Stáhnout .md",
    downloadAnalysisTitle: "Stáhnout analýzu jako Markdown",
  },
  en: {
    formHeading: "Performance analysis",
    periodLabel: "Period",
    submitAnalyzing: "Analyzing…",
    submitAnalyze: "Analyze data",
    dataNote: "The tool interprets the same (illustrative) Mionelo client data you see in the",
    dataNoteLink: "dashboard",
    dataNoteSuffix: ". The model only receives real numbers and must not invent any.",
    emptyTitle: "Performance analysis will appear here",
    emptyBody: "Select a period and let Gemini compile a performance summary, what is working, where the risks are, and what next steps make sense — all based on real numbers from the dashboard.",
    emptyHint: "Tip: select a period and click Analyze data.",
    groupWins: "What’s working",
    groupRisks: "Watch out for",
    groupActions: "Recommended actions",
    copyWins: "\nWHAT'S WORKING:",
    copyRisks: "\nWATCH OUT FOR:",
    copyActions: "\nRECOMMENDED ACTIONS:",
    downloadAnalysis: "Download .md",
    downloadAnalysisTitle: "Download analysis as Markdown",
  },
} as const;

export default function PerformanceAnalyst() {
  const t = useT(T);
  const { locale } = useLocale();
  const [period, setPeriod] = useState<AnalysisPeriod>("90d");
  // One persistence slot PER PERIOD (analysis.30d / .90d / .12m): running 30d
  // after 90d no longer overwrites the 90d analysis, switching the period
  // restores its cached result instantly (no re-generation, no lost result),
  // and the rendered analysis always belongs to the selected period.
  const { status, data, error, retryIn, upgradeUrl, timedOut, run, reset, history, activeIndex, restore } =
    useAiTool<AnalysisResult>("analysis", period);

  const r = data?.result;
  const copyAllText = r
    ? [
        r.headline,
        "",
        r.summary,
        t("copyWins"),
        ...r.wins.map((w) => `+ ${w}`),
        t("copyRisks"),
        ...r.risks.map((w) => `! ${w}`),
        t("copyActions"),
        ...r.actions.map((a) => `→ ${a.title}: ${a.detail}`),
      ].join("\n")
    : "";

  // Export the analysis as a client-ready Markdown report — the artifact an agency
  // hands a client, beyond the flat clipboard copy. Mirrors exportBriefMarkdown.
  const exportAnalysisMarkdown = () => {
    if (!r) return;
    const md = [
      `# ${r.headline}`,
      "",
      `_${analysisPeriodLabel(period, locale)}_`,
      "",
      r.summary,
      "",
      `## ${t("groupWins")}`,
      ...r.wins.map((w) => `- ${w}`),
      "",
      `## ${t("groupRisks")}`,
      ...r.risks.map((w) => `- ${w}`),
      "",
      `## ${t("groupActions")}`,
      ...r.actions.map((a, i) => `${i + 1}. **${a.title}** — ${a.detail}`),
    ].join("\n");
    downloadText(`systedo-analyza-${period}.md`, md, "text/markdown;charset=utf-8");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
      <div className="card space-y-5 p-6 lg:sticky lg:top-24">
        <h2 className="text-base font-semibold text-navy-800">{t("formHeading")}</h2>

        <div>
          <p className="mb-1.5 text-sm font-medium text-navy-700">{t("periodLabel")}</p>
          <div className="grid grid-cols-3 gap-2">
            {ANALYSIS_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-lg border px-2 py-2 text-center text-sm font-medium transition-colors ${
                  period === p
                    ? "border-brand-400 bg-brand-50 text-brand-800"
                    : "border-line text-muted hover:border-navy-200"
                }`}
              >
                {analysisPeriodLabel(p, locale)}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => status !== "loading" && run({ period })}
          disabled={status === "loading"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
        >
          {status === "loading" ? (
            <>
              <Gauge width={17} height={17} className="animate-pulse" />
              {t("submitAnalyzing")}
            </>
          ) : (
            <>
              <Bolt width={17} height={17} />
              {t("submitAnalyze")}
            </>
          )}
        </button>

        {r && (
          <button
            type="button"
            onClick={exportAnalysisMarkdown}
            title={t("downloadAnalysisTitle")}
            className="inline-flex w-full items-center justify-center gap-2 rounded-pill border border-line px-4 py-2.5 text-sm font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
          >
            <Download width={16} height={16} />
            {t("downloadAnalysis")}
          </button>
        )}

        <p className="rounded-lg bg-canvas px-4 py-3 text-xs leading-relaxed text-muted">
          {t("dataNote")}{" "}
          <Link href="/dashboard" className="font-medium text-brand-accent hover:text-brand-800">
            {t("dataNoteLink")}
          </Link>
          {t("dataNoteSuffix")}
        </p>
      </div>

      <div className="min-w-0">
        {status === "idle" && (
          <ToolEmpty
            icon={Gauge}
            title={t("emptyTitle")}
            body={t("emptyBody")}
            hint={t("emptyHint")}
          />
        )}
        {status === "loading" && <LoadingTimer />}
        {status === "error" &&
          (timedOut ? (
            <TimeoutState onRetry={reset} />
          ) : (
            <ToolError message={error ?? ""} onRetry={reset} retryIn={retryIn} upgradeUrl={upgradeUrl} />
          ))}

        {status === "done" && r && data && (
          <div className="animate-fade-up space-y-5">
            <ResultMeta
              meta={data.meta}
              copyAllText={copyAllText}
              // The result is stored per period, so the selected period IS the
              // period this analysis covers — label it to kill the old
              // "picker says 30 dní, text analyses 12 months" mismatch.
              extra={
                <span className="pill bg-brand-50 text-brand-700">
                  {analysisPeriodLabel(period, locale)}
                </span>
              }
              history={history}
              activeIndex={activeIndex}
              onRestore={restore}
            />

            {/* headline + summary */}
            <div className="rounded-card border border-navy-200 bg-navy-50 p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-onyx text-brand-400">
                  <Target width={18} height={18} />
                </span>
                <div>
                  <p className="font-semibold text-navy-800">{r.headline}</p>
                  <p className="mt-2 text-sm leading-relaxed text-navy-700">{r.summary}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {r.wins.length > 0 && (
                <Group title={t("groupWins")}>
                  <ul className="space-y-2.5">
                    {r.wins.map((w, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-navy-700">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-positive-soft text-positive">
                          <Check width={12} height={12} />
                        </span>
                        <span className="leading-snug">{w}</span>
                      </li>
                    ))}
                  </ul>
                </Group>
              )}

              {r.risks.length > 0 && (
                <Group title={t("groupRisks")}>
                  <ul className="space-y-2.5">
                    {r.risks.map((w, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-navy-700">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-coral-soft text-coral-600">
                          <TrendDown width={12} height={12} />
                        </span>
                        <span className="leading-snug">{w}</span>
                      </li>
                    ))}
                  </ul>
                </Group>
              )}
            </div>

            {r.actions.length > 0 && (
              <Group title={t("groupActions")} hint={`${r.actions.length}`}>
                <ol className="space-y-2.5">
                  {r.actions.map((a, i) => (
                    <li key={i} className="flex gap-3 rounded-card border border-line bg-surface p-4">
                      <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-navy-800">{a.title}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-navy-600">{a.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Group>
            )}

            <PromptDisclosure prompt={data.meta.prompt} />
          </div>
        )}
      </div>
    </div>
  );
}
