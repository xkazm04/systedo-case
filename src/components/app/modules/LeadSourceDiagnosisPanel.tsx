"use client";

/** Client-only „AI diagnóza zdroje" panel co-located with the server-rendered
 *  LeadQualityModule. Receives a lightweight projection of the under-performing
 *  (junk / weak) sources — REAL computed metrics only — lets the user pick one and
 *  asks the shared /api/ai „lead-source-diagnosis" tool WHY it under-performs
 *  (spam vs mis-targeting vs pricing/fit) plus the one concrete action. The
 *  request is built lazily on click (no work during render) so the parent stays a
 *  pure server component. Renders summary / likelyCause / recommendation with the
 *  module's card + Pill styling, plus loading / error / timeout / demo states. */
import { useState } from "react";
import { Pill, type PillTone } from "@/components/ui";
import { Bulb, Funnel, Sparkles, Target } from "@/components/icons";
import {
  LEAD_SOURCE_CAUSE_LABELS,
  type LeadSourceCause,
  type LeadSourceDiagnosisRequest,
  type LeadSourceDiagnosisResult,
  type LeadSourceSeverity,
} from "@/lib/ai-types";
import { fmtCZK, fmtInt, fmtPct } from "@/lib/format";
import { useAiTool } from "@/components/ai/useAiTool";
import {
  LoadingTimer,
  PromptDisclosure,
  ResultMeta,
  TimeoutState,
  ToolError,
} from "@/components/ai/primitives";

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
  return req;
}

const CAUSE_TONE: Record<LeadSourceCause, PillTone> = {
  spam: "negative",
  "mis-targeting": "coral",
  pricing: "coral",
  volume: "neutral",
  ok: "positive",
};

const SEVERITY_LABEL: Record<LeadSourceSeverity, string> = {
  high: "Vysoká závažnost",
  medium: "Střední závažnost",
  low: "Nízká závažnost",
};

const SEVERITY_TONE: Record<LeadSourceSeverity, PillTone> = {
  high: "negative",
  medium: "coral",
  low: "neutral",
};

export default function LeadSourceDiagnosisPanel({ seeds }: { seeds: LeadSourceSeed[] }) {
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
            AI diagnóza zdroje
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Model dostane jen spočítaná čísla zdroje a pojmenuje příčinu, proč podvýkonný (spam,
            špatné cílení, nebo cena), i konkrétní akci. Nevymýšlí žádné hodnoty.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {seeds.length > 1 && (
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              disabled={status === "loading"}
              aria-label="Vyberte zdroj k diagnostice"
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
            {status === "loading" ? "Analyzuji…" : "AI diagnóza"}
          </button>
        </div>
      </div>

      <div className="p-5">
        {status === "idle" && (
          <p className="text-sm leading-relaxed text-muted">
            Vyberte podvýkonný zdroj a klikněte na „AI diagnóza“ — model přečte jeho čísla a určí,
            proč nevýkonný a kde začít. Funguje i bez API klíče v ukázkovém režimu.
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
                Diagnóza zdroje{" "}
                <span className="font-medium text-navy-700">„{selected.source}“</span> · míra
                kvalifikace {fmtPct(selected.qualRate)} · win rate {fmtPct(selected.winRate)}
                {selected.costPerQualified != null
                  ? ` · CPQL ${fmtCZK(selected.costPerQualified)}`
                  : ""}{" "}
                · {fmtInt(selected.leads)} leadů.
              </p>
            )}

            <div className="rounded-card border border-navy-200 bg-navy-50 p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-onyx text-brand-400">
                  <Funnel width={18} height={18} />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-navy-700">Pravděpodobná příčina:</span>
                    <Pill tone={CAUSE_TONE[r.likelyCause]}>
                      {LEAD_SOURCE_CAUSE_LABELS[r.likelyCause]}
                    </Pill>
                    {r.severity && (
                      <Pill tone={SEVERITY_TONE[r.severity]}>{SEVERITY_LABEL[r.severity]}</Pill>
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
                  Doporučená akce
                </p>
                <p className="mt-1 text-sm leading-relaxed text-navy-700">{r.recommendation}</p>
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-muted">
              <Target width={14} height={14} className="mt-0.5 shrink-0 text-brand-600" />
              <span className="leading-relaxed">
                Diagnóza vychází jen z předaných čísel zdroje — model žádná data nedoplňuje.
              </span>
            </div>

            <PromptDisclosure prompt={data.meta.prompt} />
          </div>
        )}
      </div>
    </div>
  );
}
