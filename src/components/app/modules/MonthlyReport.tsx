"use client";

/** Měsíční report / Monthly report — a client-ready performance recap: KPI tiles
 *  grounded in the same snapshot the AI reads, plus an on-demand AI narrative.
 *  The narrative uses the `monthly-recap` op — grounded on THIS project's dataset
 *  and framed to its business type, so it fits non-eshop projects. Print +
 *  Markdown export. Account epic. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bolt, Check, Document, Download, Gauge, Target, TrendDown } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { downloadText } from "@/lib/export";
import { ANALYSIS_PERIODS, analysisPeriodLabel, type AnalysisPeriod, type MonthlyRecapResult } from "@/lib/ai-types";
import { useAiTool } from "@/components/ai/useAiTool";
import { deltaTone, type ReportMetric, type ReportSnap, type ReportTileSpec } from "@/lib/report/compute";
import CostModelEditor, { type CostModelView } from "@/components/app/modules/CostModelEditor";
import CompetitorEditor from "@/components/app/modules/CompetitorEditor";
import type { Competitor } from "@/lib/competitors/types";
import ReportBeyond, { type ReportBeyondData } from "@/components/app/modules/ReportBeyond";

const T = {
  cs: {
    heading: "Měsíční report", periodLabel: "Období", print: "Tisk / PDF", downloadMd: "Stáhnout .md",
    note: "Ilustrativní data klienta (stejná jako v dashboardu). AI dostává jen reálná čísla a nesmí si žádná vymýšlet.",
    liveData: "Živá data · Google Ads", syncedAt: "synchronizováno {date}",
    syncCta: "Synchronizovat z Google Ads", resync: "Synchronizovat znovu", syncing: "Synchronizuji…",
    syncFailed: "Synchronizace se nezdařila.",
    narrativeHeading: "Souhrn od AI", generate: "Vygenerovat souhrn", regenerate: "Vygenerovat znovu", generating: "Generuji…",
    idle: "Nech AI sestavit shrnutí výkonu za období na základě čísel výše.",
    error: "Souhrn se nepodařilo vygenerovat.", retry: "Zkusit znovu",
    wins: "Co se daří", risks: "Na co si dát pozor", actions: "Doporučené kroky",
    vsPrev: "vs. předchozí období",
  },
  en: {
    heading: "Monthly report", periodLabel: "Period", print: "Print / PDF", downloadMd: "Download .md",
    note: "Illustrative client data (the same you see in the dashboard). The AI only receives real numbers and must not invent any.",
    liveData: "Live data · Google Ads", syncedAt: "synced {date}",
    syncCta: "Sync from Google Ads", resync: "Re-sync", syncing: "Syncing…",
    syncFailed: "Sync failed.",
    narrativeHeading: "AI summary", generate: "Generate summary", regenerate: "Regenerate", generating: "Generating…",
    idle: "Let the AI compile a performance summary for the period based on the figures above.",
    error: "Could not generate the summary.", retry: "Try again",
    wins: "What’s working", risks: "Watch out for", actions: "Recommended actions",
    vsPrev: "vs. previous period",
  },
} as const;

export default function MonthlyReport({
  tiles,
  snaps,
  projectName,
  logoUrl,
  projectId,
  live = false,
  syncedAt,
  customerId,
  showCostModel = false,
  costModel = null,
  competitors = [],
  beyond = null,
}: {
  tiles: ReportTileSpec[];
  snaps: Record<AnalysisPeriod, ReportSnap>;
  projectName: string;
  logoUrl?: string;
  /** the project whose /metrics/sync endpoint the "sync" control hits (omit to hide it) */
  projectId?: string;
  /** true when the tiles are the client's own synced Ads data, not the sample series */
  live?: boolean;
  /** ISO timestamp of the last live sync */
  syncedAt?: string;
  /** the ad account behind the live data */
  customerId?: string;
  /** A3: show the cost-model control (e-shop only) so profit reflects real margin */
  showCostModel?: boolean;
  /** the saved cost model, or null when profit is still pre-COGS contribution */
  costModel?: CostModelView | null;
  /** C3: the project's competitor set — grounds the AI narrative "vs. the market" */
  competitors?: Competitor[];
  /** D1: LTV + stock/seasonality headline numbers composed into the report (e-shop) */
  beyond?: ReportBeyondData | null;
}) {
  const t = useT(T);
  const { locale } = useLocale();
  const router = useRouter();
  const { fmtInt, fmtCZKCompact, fmtPct, fmtMultiple, fmtSignedPct } = useFormatters();
  const [period, setPeriod] = useState<AnalysisPeriod>("30d");
  const [syncing, setSyncing] = useState(false);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const { status, data, run, reset } = useAiTool<MonthlyRecapResult>("monthly-recap", period);

  async function syncNow() {
    if (!projectId || syncing) return;
    setSyncing(true);
    setSyncErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/metrics/sync`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) router.refresh();
      else setSyncErr(json.error || t("syncFailed"));
    } catch {
      setSyncErr(t("syncFailed"));
    } finally {
      setSyncing(false);
    }
  }

  const en = locale === "en";
  const snap = snaps[period];
  const r = data?.result;

  const tileLabel = (spec: ReportTileSpec): string => (en ? spec.labelEn : spec.label);
  const fmtVal = (metric: ReportMetric, v: number): string => {
    const spec = tiles.find((s) => s.metric === metric);
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
      "| " + tiles.map((s) => tileLabel(s)).join(" | ") + " |",
      "| " + tiles.map(() => "---").join(" | ") + " |",
      "| " + tiles.map((s) => fmtVal(s.metric, snap.current[s.metric] ?? 0)).join(" | ") + " |",
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
        <div className="flex items-center gap-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={projectName} className="h-10 w-auto max-w-[160px] object-contain" />
          )}
          <div>
            <h2 className="text-lg font-semibold text-navy-800">{projectName}</h2>
            <p className="text-sm text-muted">{t("heading")} · {analysisPeriodLabel(period, locale)}</p>
          </div>
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
        {tiles.map((spec) => {
          const value = snap.current[spec.metric] ?? 0;
          const d = spec.hasDelta ? snap.delta[spec.metric] : undefined;
          return (
            <div key={spec.metric} className="card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{tileLabel(spec)}</p>
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

      {/* Data source — honest about live vs illustrative, with a sync affordance. */}
      {live ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-positive-soft px-4 py-3 text-xs leading-relaxed">
          <span className="font-medium text-positive">
            <Check width={12} height={12} className="mb-0.5 mr-1 inline" />
            {t("liveData")}
            {customerId ? ` · ${customerId}` : ""}
            {syncedAt ? ` · ${t("syncedAt", { date: syncedAt.slice(0, 10) })}` : ""}
          </span>
          {projectId && (
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing}
              className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50 print:hidden"
            >
              {syncing ? t("syncing") : t("resync")}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-lg bg-canvas px-4 py-3 text-xs leading-relaxed text-muted">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t("note")}</span>
            {projectId && (
              <button
                type="button"
                onClick={syncNow}
                disabled={syncing}
                className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50 print:hidden"
              >
                {syncing ? t("syncing") : t("syncCta")}
              </button>
            )}
          </div>
          {syncErr && <p className="mt-2 text-negative">{syncErr}</p>}
        </div>
      )}

      {/* A3: cost model — true net profit after COGS + overhead (e-shop). */}
      {showCostModel && projectId && <CostModelEditor projectId={projectId} model={costModel} />}

      {/* C3: competitor set — grounds the AI narrative "vs. the market". */}
      {projectId && <CompetitorEditor projectId={projectId} initial={competitors} />}

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

      {/* D1: compose the LTV + stock/seasonality spines into the report (e-shop). */}
      {beyond && projectId && <ReportBeyond projectId={projectId} data={beyond} />}
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
