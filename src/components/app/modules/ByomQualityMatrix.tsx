"use client";

/** Read-only quality matrix: every AI operation (rows) scored across the measured
 *  models (columns), best-per-operation starred. Reads the same static baked scores
 *  as ByomQualityOverview — no auth, no API — so it can render on the public
 *  /kvalita-modelu page as well as inside the authed settings. */
import { useT } from "@/lib/i18n/client";
import { BYOM_OPERATIONS } from "@/lib/llm/keys/types";
import { bestModelForOp, cellComposite, modelOverall, modelRanking } from "@/lib/llm/quality";
import { QUALITY_SCORES, hasQualityScores } from "@/lib/llm/quality-scores";

const T = {
  cs: {
    title: "Skóre podle operace",
    intro:
      "Složené skóre (0–10) každého modelu v jednotlivých AI operacích. ★ označuje nejlepší naměřený model pro danou operaci; „—“ znamená, že model operaci neobsloužil.",
    colOperation: "Operace",
    avg: "Průměr",
    na: "—",
  },
  en: {
    title: "Score by operation",
    intro:
      "Composite score (0–10) of each model per AI operation. ★ marks the best measured model for an operation; “—” means the model didn’t serve it.",
    colOperation: "Operation",
    avg: "Average",
    na: "—",
  },
} as const;

const short = (slug: string) => slug.split("/").pop() ?? slug;
const tone = (s: number) =>
  s >= 8 ? "text-positive" : s >= 6 ? "text-navy-800" : s >= 4 ? "text-coral-600" : "text-negative";

export default function ByomQualityMatrix() {
  const t = useT(T);
  if (!hasQualityScores()) return null;

  const models = modelRanking(QUALITY_SCORES).map((m) => m.model); // strongest first
  const ops = BYOM_OPERATIONS.filter((op) => QUALITY_SCORES.cells[op.id]);

  const thBase = "px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted";
  const tdBase = "px-3 py-2.5 tnum text-center";

  return (
    <section className="mt-10 max-w-4xl">
      <h3 className="text-lg font-semibold text-navy-800">{t("title")}</h3>
      <p className="mt-0.5 text-sm text-muted">{t("intro")}</p>

      <div className="card mt-4 overflow-x-auto p-0">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={`${thBase} text-left`}>{t("colOperation")}</th>
              {models.map((m) => (
                <th key={m} className={thBase} title={m}>
                  {short(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ops.map((op) => {
              const best = bestModelForOp(QUALITY_SCORES, op.id)?.model;
              return (
                <tr key={op.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2.5 text-left font-medium text-navy-800">{op.label}</td>
                  {models.map((m) => {
                    const s = cellComposite(QUALITY_SCORES, op.id, m);
                    const isBest = s !== null && m === best;
                    return (
                      <td
                        key={m}
                        className={`${tdBase} ${s === null ? "text-muted" : tone(s)} ${isBest ? "font-semibold" : ""}`}
                      >
                        {s === null ? (
                          t("na")
                        ) : (
                          <>
                            {isBest && <span className="text-brand-accent">★</span>} {s.toFixed(1)}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="border-t-2 border-line bg-navy-50">
              <td className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                {t("avg")}
              </td>
              {models.map((m) => {
                const o = modelOverall(QUALITY_SCORES, m).overall;
                return (
                  <td key={m} className={`${tdBase} font-semibold ${o === null ? "text-muted" : tone(o)}`}>
                    {o === null ? t("na") : o.toFixed(1)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
