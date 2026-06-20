"use client";

/** Client-only "AI diagnóza zdroje" panel co-located with the server-rendered
 *  LeadQualityModule. Receives a lightweight projection of the under-performing
 *  (junk / weak) sources — REAL computed metrics only — lets the user pick one and
 *  asks the shared /api/ai "lead-source-diagnosis" tool WHY it under-performs
 *  (spam vs mis-targeting vs pricing/fit) plus the one concrete action. The
 *  request is built lazily on click (no work during render) so the parent stays a
 *  pure server component. Renders summary / likelyCause / recommendation with the
 *  module's card + Pill styling, plus loading / error / timeout / demo states. */
import { useState } from "react";
import { Pill, type PillTone } from "@/components/ui";
import { Bulb, Funnel, Sparkles, Target } from "@/components/icons";
import {
  leadSourceCauseLabel,
  type LeadSourceCause,
  type LeadSourceDiagnosisRequest,
  type LeadSourceDiagnosisResult,
  type LeadSourcePeer,
  type LeadSourceSeverity,
} from "@/lib/ai-types";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAiTool } from "@/components/ai/useAiTool";
import {
  LoadingTimer,
  PromptDisclosure,
  ResultMeta,
  TimeoutState,
  ToolError,
} from "@/components/ai/primitives";

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
  },
} as const;

/** The few real numbers the panel needs per source — a projection built by the
 *  parent server component, so no compute / sample data ships with the client. */
export interface LeadSourceSeed {
  source: string;
  leads: number;
  qualified: number;
  won: number;
  qualRate: number;
  winRate: number;
  /** only set for paid sources */
  spend?: number;
  cpql?: number;
  costPerQualified?: number;
  /** flagged as junk by the module's threshold (drives the badge) */
  junk: boolean;
  /** other sources' compact metrics (best-first) for budget-shift comparison */
  peers?: LeadSourcePeer[];
}

/** Build the request from the picked seed at click time (never during render). */
function buildRequest(seed: LeadSourceSeed): LeadSourceDiagnosisRequest {
  const req: LeadSourceDiagnosisRequest = {
    source: seed.source,
    leads: seed.leads,
    qualified: seed.qualified,
    won: seed.won,
    qualRate: seed.qualRate,
    winRate: seed.winRate,
  };
  if (seed.spend != null && seed.spend > 0) req.spend = seed.spend;
  if (seed.cpql != null) req.cpql = seed.cpql;
  if (seed.costPerQualified != null) req.costPerQualified = seed.costPerQualified;
  if (seed.peers && seed.peers.length > 0) req.peers = seed.peers;
  return req;
}

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

export default function LeadSourceDiagnosisPanel({ seeds }: { seeds: LeadSourceSeed[] }) {
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();
  const { status, data, error, timedOut, run, reset } =
    useAiTool<LeadSourceDiagnosisResult>("lead-source-diagnosis");
  const [selectedSource, setSelectedSource] = useState(seeds[0]?.source ?? "");
  const selected = seeds.find((s) => s.source === selectedSource) ?? seeds[0];
  const r = data?.result;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-navy-800">
            <Sparkles width={16} height={16} className="shrink-0 text-brand-accent" />
            {t("panelTitle")}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {t("panelDesc")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {seeds.length > 1 && (
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
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
          <button
            type="button"
            onClick={() =>
              status !== "loading" &&
              selected &&
              run(buildRequest(selected) as unknown as Record<string, unknown>)
            }
            disabled={status === "loading" || !selected}
            className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          >
            <Sparkles width={15} height={15} className={status === "loading" ? "animate-pulse" : ""} />
            {status === "loading" ? t("runningBtn") : t("diagBtn")}
          </button>
        </div>
      </div>

      <div className="p-5">
        {status === "idle" && (
          <p className="text-sm leading-relaxed text-muted">
            {t("idleHint")}
          </p>
        )}

        {status === "loading" && <LoadingTimer />}

        {status === "error" &&
          (timedOut ? (
            <TimeoutState onRetry={reset} />
          ) : (
            <ToolError message={error ?? ""} onRetry={reset} />
          ))}

        {status === "done" && r && data && (
          <div className="animate-fade-up space-y-5">
            <ResultMeta meta={data.meta} />

            {selected && (
              <p className="text-xs text-muted">
                {t("diagMeta", {
                  source: selected.source,
                  qualRate: fmt.fmtPct(selected.qualRate),
                  winRate: fmt.fmtPct(selected.winRate),
                  cpql: selected.costPerQualified != null
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
                    <Pill tone={CAUSE_TONE[r.likelyCause]}>
                      {leadSourceCauseLabel(r.likelyCause, locale)}
                    </Pill>
                    {r.severity && (
                      <Pill tone={SEVERITY_TONE[r.severity]}>
                        {r.severity === "high" ? t("severityHigh") : r.severity === "medium" ? t("severityMedium") : t("severityLow")}
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
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {t("recommendedAction")}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-navy-700">{r.recommendation}</p>
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-muted">
              <Target width={14} height={14} className="mt-0.5 shrink-0 text-brand-600" />
              <span className="leading-relaxed">
                {t("dataDisclaimer")}
              </span>
            </div>

            <PromptDisclosure prompt={data.meta.prompt} />
          </div>
        )}
      </div>
    </div>
  );
}
