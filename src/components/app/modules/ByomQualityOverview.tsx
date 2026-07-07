"use client";

import { useT } from "@/lib/i18n/client";
import { modelRanking } from "@/lib/llm/quality";
import { QUALITY_SCORES, hasQualityScores } from "@/lib/llm/quality-scores";

const T = {
  cs: {
    title: "Naměřená kvalita modelů",
    intro:
      "Naše měření kvality výstupů napříč všemi AI operacemi — pomůže vybrat poskytovatele a model do matice níže.",
    colModel: "Model",
    colScore: "Skóre",
    colWins: "Nejlepší v",
    colCoverage: "Pokrytí",
    ops: "operací",
    method:
      "Změřeno {date} · rozhodčí {judge} · {n} operací. Složené skóre 0–10: správnost a splnění úkolu váženo výše, tón níže; nevalidní výstup penalizován.",
    na: "—",
  },
  en: {
    title: "Measured model quality",
    intro:
      "Our measured output quality across every AI operation — use it to pick a provider and model in the matrix below.",
    colModel: "Model",
    colScore: "Score",
    colWins: "Best in",
    colCoverage: "Coverage",
    ops: "ops",
    method:
      "Measured {date} · judge {judge} · {n} operations. Composite 0–10: correctness + task-adherence weighted higher, tone lower; invalid output penalised.",
    na: "—",
  },
} as const;

const short = (slug: string) => slug.split("/").pop() ?? slug;
const barTone = (s: number) => (s >= 8 ? "bg-positive" : s >= 6 ? "bg-brand-500" : s >= 4 ? "bg-coral-500" : "bg-negative");

export default function ByomQualityOverview({ className = "max-w-3xl" }: { className?: string }) {
  const t = useT(T);
  if (!hasQualityScores()) return null;

  const ranking = modelRanking(QUALITY_SCORES);
  const totalOps = Object.keys(QUALITY_SCORES.cells).length;
  const date = QUALITY_SCORES.measuredAt.slice(0, 10);

  return (
    <section className={`mt-8 ${className}`}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-navy-800">{t("title")}</h3>
        <p className="mt-0.5 text-sm text-muted">{t("intro")}</p>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="hidden grid-cols-[1.5fr_1.6fr_0.8fr_0.9fr] gap-3 border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted sm:grid">
          <span>{t("colModel")}</span>
          <span>{t("colScore")}</span>
          <span className="text-right">{t("colWins")}</span>
          <span className="text-right">{t("colCoverage")}</span>
        </div>

        {ranking.map((m) => (
          <div
            key={m.model}
            className="grid grid-cols-1 gap-2 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[1.5fr_1.6fr_0.8fr_0.9fr] sm:items-center sm:gap-3"
          >
            <span className="text-sm font-medium text-navy-800" title={m.model}>
              {short(m.model)}
            </span>

            <div className="flex items-center gap-2">
              <span className="tnum w-8 text-sm font-semibold text-navy-800">
                {m.overall === null ? t("na") : m.overall.toFixed(1)}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-50" aria-hidden>
                {m.overall !== null && (
                  <span
                    className={`block h-full rounded-full ${barTone(m.overall)}`}
                    style={{ width: `${Math.round((m.overall / 10) * 100)}%` }}
                  />
                )}
              </span>
            </div>

            <span className="tnum text-sm text-navy-700 sm:text-right">
              {m.wins}/{totalOps}
            </span>
            <span className="tnum text-sm text-muted sm:text-right">
              {m.measured}/{m.total} {t("ops")}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        {t("method", { date, judge: QUALITY_SCORES.judge, n: String(totalOps) })}
      </p>
    </section>
  );
}
