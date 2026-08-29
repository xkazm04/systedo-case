"use client";

/** The per-channel table of the "what if" budget-reallocation panel. Extracted from
 *  ProfitReallocationPanel when the response-curve disclosure was added (WP W1-F) —
 *  the panel keeps the controls and the summary band, this owns the rows.
 *
 *  The disclosure is the reason it exists: each row says whether its suggested spend
 *  came from a FITTED diminishing-returns curve (and how steep it is) or from the old
 *  constant-ROAS line with its 3× cap — and, when the curve is only the account's shape
 *  re-based onto the channel's share, it says that too rather than claiming a per-channel
 *  measurement nobody made. */

import { Pill } from "@/components/ui";
import type { ReallocChannel, ReallocPlan } from "@/lib/profit/types";
import { useFormatters, useT } from "@/lib/i18n/client";

const T = {
  cs: {
    colChannel: "Kanál",
    colToday: "Dnes",
    colProposal: "Návrh",
    colChange: "Změna",
    colProfitPerUnit: "Zisk / Kč",
    colProjProfit: "Projekt. zisk",
    basisCurve: "křivka · b={b}",
    basisAccountCurve: "křivka z účtu · b={b}",
    basisLinear: "lineárně",
    basisCurveTitle:
      "Rozpočet rozdělen podle mezního zisku na křivce odezvy tohoto kanálu (b={b}, spolehlivost fitu R²={r2}). b pod 1 = klesající výnosy: každá další koruna vydělá méně.",
    basisAccountCurveTitle:
      "Tvar křivky je změřen na celém účtu a přepočten podílem kanálu — ne na datech samotného kanálu (b={b}, R²={r2}). Směr je správný, přesnost orientační.",
    basisLinearTitle:
      "Pro tento kanál nejsou data na křivku odezvy, takže drží dnešní ROAS a strop 3× dnešní útraty — jako dřív.",
    marginalTitle: "Mezní zisk na korunu při navržené útratě (ne průměr za celé období).",
    averageTitle: "Průměrný hrubý zisk na korunu reklamy při dnešním ROAS.",
  },
  en: {
    colChannel: "Channel",
    colToday: "Today",
    colProposal: "Proposed",
    colChange: "Change",
    colProfitPerUnit: "Profit / unit",
    colProjProfit: "Proj. profit",
    basisCurve: "curve · b={b}",
    basisAccountCurve: "account curve · b={b}",
    basisLinear: "linear",
    basisCurveTitle:
      "Budget allocated by marginal profit along this channel's own response curve (b={b}, fit quality R²={r2}). b below 1 means diminishing returns: each next unit earns less.",
    basisAccountCurveTitle:
      "The curve's shape was measured on the whole account and re-based by this channel's share — not on the channel's own data (b={b}, R²={r2}). The direction holds; the precision is indicative.",
    basisLinearTitle:
      "No data supports a response curve for this channel, so it holds today's ROAS and the 3× spend cap — unchanged.",
    marginalTitle: "Marginal profit per unit of spend AT the suggested budget (not the period average).",
    averageTitle: "Average gross profit per unit of ad spend at today's ROAS.",
  },
} as const;

export default function ReallocationTable({ plan }: { plan: ReallocPlan }) {
  const fmt = useFormatters();
  const t = useT(T);

  // Only disclose a basis when a curve was actually offered for some channel; on the
  // pure constant-ROAS plan the column would be a row of identical "linear" chips.
  const showBasis = plan.rows.some((r) => r.curve);

  const basis = (r: ReallocChannel) => {
    const b = fmt.fmtDecimal(r.curve?.b ?? 1, 2);
    const r2 = fmt.fmtDecimal(r.curve?.r2 ?? 0, 2);
    if (!r.curve?.fitted) return { label: t("basisLinear"), title: t("basisLinearTitle"), tone: "neutral" as const };
    if (r.curve.basis === "account-scaled") {
      return {
        label: t("basisAccountCurve", { b }),
        title: t("basisAccountCurveTitle", { b, r2 }),
        tone: "navy" as const,
      };
    }
    return { label: t("basisCurve", { b }), title: t("basisCurveTitle", { b, r2 }), tone: "brand" as const };
  };

  return (
    <div className="overflow-x-auto border-t border-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-medium">{t("colChannel")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("colToday")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("colProposal")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("colChange")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("colProfitPerUnit")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("colProjProfit")}</th>
          </tr>
        </thead>
        <tbody>
          {plan.rows.map((r) => {
            const marginal = r.marginalPoasAtSuggested;
            const info = basis(r);
            return (
              <tr key={r.channel} className="border-b border-line/70 last:border-0">
                <td className="px-4 py-3">
                  <span className="flex flex-wrap items-center gap-2 font-medium text-navy-800">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                    {r.channel}
                    {showBasis && (
                      <span title={info.title}>
                        <Pill tone={info.tone}>{info.label}</Pill>
                      </span>
                    )}
                  </span>
                </td>
                <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtCZKCompact(r.currentSpend)}</td>
                <td className="tnum px-4 py-3 text-right font-medium text-navy-800">{fmt.fmtCZKCompact(r.suggestedSpend)}</td>
                <td
                  className={`tnum px-4 py-3 text-right font-medium ${
                    r.spendDelta > 0 ? "text-positive" : r.spendDelta < 0 ? "text-negative" : "text-muted"
                  }`}
                >
                  {r.spendDelta > 0 ? "+" : r.spendDelta < 0 ? "−" : ""}
                  {fmt.fmtCZKCompact(Math.abs(r.spendDelta))}
                </td>
                {/* Gross profit per koruna of spend. On a curve-allocated row this is the
                    MARGINAL value at the suggested budget (marginalPoas + 1 puts it on the
                    same "profit per koruna" scale as today's roas × margin), which is the
                    number the constant-ROAS model was hiding. */}
                <td className="tnum px-4 py-3 text-right text-muted" title={marginal === undefined ? t("averageTitle") : t("marginalTitle")}>
                  {fmt.fmtMultiple(marginal === undefined ? r.roas * r.marginPct : marginal + 1)}
                </td>
                <td
                  className={`tnum px-4 py-3 text-right font-semibold ${
                    r.projectedNetProfit >= 0 ? "text-positive" : "text-negative"
                  }`}
                >
                  {fmt.fmtCZK(r.projectedNetProfit)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
