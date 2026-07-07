"use client";

/** Měsíční report / Monthly report — a client-ready performance recap: KPI tiles
 *  grounded in the same snapshot the AI reads, plus an on-demand AI narrative.
 *  The narrative uses the `monthly-recap` op — grounded on THIS project's dataset
 *  and framed to its business type, so it fits non-eshop projects. Print +
 *  Markdown export. Account epic. */
import { useState } from "react";
import { Bolt, Check, Document, Download, Gauge, Target, TrendDown } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { downloadText } from "@/lib/export";
import { ANALYSIS_PERIODS, analysisPeriodLabel, type AnalysisPeriod, type MonthlyRecapResult } from "@/lib/ai-types";
import { useAiTool } from "@/components/ai/useAiTool";
import { deltaTone, REPORT_TILES, type ReportMetric, type ReportSnap } from "@/lib/report/compute";

const T = {
  cs: {
    heading: "Měsíční report", periodLabel: "Období", print: "Tisk / PDF", downloadMd: "Stáhnout .md",
    note: "Ilustrativní data klienta (stejná jako v dashboardu). AI dostává jen reálná čísla a nesmí si žádná vymýšlet.",
    narrativeHeading: "Souhrn od AI", generate: "Vygenerovat souhrn", regenerate: "Vygenerovat znovu", generating: "Generuji…",
    idle: "Nech AI sestavit shrnutí výkonu za období na základě čísel výše.",
    error: "Souhrn se nepodařilo vygenerovat.", retry: "Zkusit znovu",
    wins: "Co se daří", risks: "Na co si dát pozor", actions: "Doporučené kroky",
    vsPrev: "vs. předchozí období",
  },
  en: {
    heading: "Monthly report", periodLabel: "Period", print: "Print / PDF", downloadMd: "Download .md",
    note: "Illustrative client data (the same you see in the dashboard). The AI only receives real numbers and must not invent any.",
    narrativeHeading: "AI summary", generate: "Generate summary", regenerate: "Regenerate", generating: "Generating…",
    idle: "Let the AI compile a performance summary for the period based on the figures above.",
    error: "Could not generate the summary.", retry: "Try again",
    wins: "What’s working", risks: "Watch out for", actions: "Recommended actions",
    vsPrev: "vs. previous period",
  },
} as const;

const METRIC_LABEL: Record<"cs" | "en", Record<ReportMetric, string>> = {
  cs: { revenue: "Obrat", roas: "ROAS", pno: "PNO", conversions: "Konverze", cost: "Náklady", visits: "Návštěvy" },
  en: { revenue: "Revenue", roas: "ROAS", pno: "PNO", conversions: "Conversions", cost: "Cost", visits: "Visits" },
};

export default function MonthlyReport({ snaps, projectName }: { snaps: Record<AnalysisPeriod, ReportSnap>; projectName: string }) {
  const t = useT(T);
  const { locale } = useLocale();
  const { fmtInt, fmtCZKCompact, fmtPct, fmtMultiple, fmtSignedPct } = useFormatters();
  const [period, setPeriod] = useState<AnalysisPeriod>("30d");
  const { status, data, run, reset } = useAiTool<MonthlyRecapResult>("monthly-recap", period);

  const snap = snaps[period];
  const labels = METRIC_LABEL[locale === "en" ? "en" : "cs"];
  const r = data?.result;

  const fmtVal = (metric: ReportMetric, v: number): string => {
    const spec = REPORT_TILES.find((s) => s.metric === metric);
    switch (spec?.format) {
      case "czk": return fmtCZKCompact(v);
      case "multiple": return fmtMultiple(v);
      case "pct": return fmtPct(v);
      default: return fmtInt(v);
    }
  };
  const toneClass = (tone: string) => (tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-muted");

  function exportMd() {
    const lines = [
      `# ${t("heading")} — ${projectName}`,
      "",
      `_${analysisPeriodLabel(period, locale)}_`,
      "",
      "| " + REPORT_TILES.map((s) => labels[s.metric]).join(" | ") + " |",
      "| " + REPORT_TILES.map(() => "---").join(" | ") + " |",
      "| " + REPORT_TILES.map((s) => fmtVal(s.metric, snap.current[s.metric])).join(" | ") + " |",
    ];
    if (r) {
      lines.push("", `## ${r.headline}`, "", r.summary,
        "", `### ${t("wins")}`, ...r.highlights.map((w) => `- ${w}`),
        "", `### ${t("risks")}`, ...r.watchouts.map((w) => `- ${w}`),
        "", `### ${t("actions")}`, ...r.priorities.map((a, i) => `${i + 1}. **${a.title}** — ${a.detail}`));
    }
    downloadText(`report-${period}.md`, lines.join("\n"), "text/markdown;charset=utf-8");
  }

  return (
    <div id="monthly-report" className="space-y-6">
      {/* header + controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-navy-800">{projectName}</h2>
          <p className="text-sm text-muted">{t("heading")} · {analysisPeriodLabel(period, locale)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="inline-flex overflow-hidden rounded-pill border border-line">
            {ANALYSIS_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={"px-3 py-1.5 text-xs font-semibold transition-colors " + (period === p ? "bg-brand-500/15 text-brand-accent" : "text-muted hover:bg-brand-50")}
              >
                {analysisPeriodLabel(p, locale)}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-2 text-xs font-semibold text-navy-800 transition-colors hover:border-brand-300">
            <Document width={14} height={14} />{t("print")}
          </button>
          <button type="button" onClick={exportMd} className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-2 text-xs font-semibold text-navy-800 transition-colors hover:border-brand-300">
            <Download width={14} height={14} />{t("downloadMd")}
          </button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {REPORT_TILES.map((spec) => {
          const value = snap.current[spec.metric];
          const d = spec.hasDelta ? snap.delta[spec.metric] : undefined;
          return (
            <div key={spec.metric} className="card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{labels[spec.metric]}</p>
              <p className="tnum mt-1 text-2xl font-semibold text-navy-800">{fmtVal(spec.metric, value)}</p>
              {typeof d === "number" && (
                <p className={"tnum mt-0.5 text-xs font-medium " + toneClass(deltaTone(d, spec.goodWhenDown))}>
                  {fmtSignedPct(d)} <span className="text-muted">{t("vsPrev")}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="rounded-lg bg-canvas px-4 py-3 text-xs leading-relaxed text-muted">{t("note")}</p>

      {/* AI narrative */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-navy-800">{t("narrativeHeading")}</h3>
          <button
            type="button"
            onClick={() => status !== "loading" && run({ period })}
            disabled={status === "loading"}
            className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50 print:hidden"
          >
            {status === "loading" ? <Gauge width={16} height={16} className="animate-pulse" /> : <Bolt width={16} height={16} />}
            {status === "loading" ? t("generating") : r ? t("regenerate") : t("generate")}
          </button>
        </div>

        {status === "idle" && <p className="mt-4 text-sm text-muted">{t("idle")}</p>}
        {status === "loading" && <div className="mt-4 h-24 animate-pulse rounded-card bg-canvas" />}
        {status === "error" && (
          <div className="mt-4 text-sm">
            <p className="text-negative">{t("error")}</p>
            <button type="button" onClick={reset} className="mt-2 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 hover:border-brand-300">{t("retry")}</button>
          </div>
        )}
        {status === "done" && r && (
          <div className="animate-fade-up mt-4 space-y-5">
            <div className="rounded-card border border-navy-200 bg-navy-50 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-onyx text-brand-400"><Target width={18} height={18} /></span>
                <div>
                  <p className="font-semibold text-navy-800">{r.headline}</p>
                  <p className="mt-2 text-sm leading-relaxed text-navy-700">{r.summary}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {r.highlights.length > 0 && (
                <Group title={t("wins")}>
                  {r.highlights.map((w, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-navy-700">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-positive-soft text-positive"><Check width={12} height={12} /></span>
                      <span className="leading-snug">{w}</span>
                    </li>
                  ))}
                </Group>
              )}
              {r.watchouts.length > 0 && (
                <Group title={t("risks")}>
                  {r.watchouts.map((w, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-navy-700">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-coral-soft text-coral-600"><TrendDown width={12} height={12} /></span>
                      <span className="leading-snug">{w}</span>
                    </li>
                  ))}
                </Group>
              )}
            </div>
            {r.priorities.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-navy-800">{t("actions")}</p>
                <ol className="space-y-2.5">
                  {r.priorities.map((a, i) => (
                    <li key={i} className="flex gap-3 rounded-card border border-line bg-surface p-4">
                      <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">{i + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-navy-800">{a.title}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-navy-600">{a.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-navy-800">{title}</p>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  );
}
