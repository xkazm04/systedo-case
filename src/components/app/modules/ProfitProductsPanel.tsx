"use client";

/** Product / category profit view (feature #2): the period's revenue and ad cost
 *  rolled up to product categories by revenue share, surfacing the lowest-POAS
 *  category. Co-located "use client" child of ProfitModule — the roll-up
 *  (`computeProductProfit`) and the worst-category pick (`lowestPoasCategory`) run
 *  in the orchestrator; this panel receives the already-computed result as props. */

import { Layers } from "@/components/icons";
import type { ProductRow, ProductSummary } from "@/lib/profit/types";
import { useFormatters, useT } from "@/lib/i18n/client";

const T = {
  cs: {
    categoryWorstAlert: "Kategorie {category} má nejnižší POAS {poas} — při marži {margin} a podílu {share} obratu prodělává. Zvažte vyšší prodejní cenu nebo přesun reklamního rozpočtu jinam.",
    netProfitProducts: "Čistý zisk (produkty)",
    marginVsCogs: "marže z prodejní ceny vs cena zboží",
    poasProducts: "POAS (produkty)",
    blendedMarginSub: "blended marže {value}",
    unprofitableCategories: "Ztrátové kategorie",
    belowBreakeven: "POAS pod bodem zvratu",
    colCategory: "Kategorie",
    colRevenueShare: "Podíl obratu",
    colRevenue: "Obrat",
    colCost: "Náklady",
    colProductMargin: "Marže",
    colPoas: "POAS",
    colNetProfit: "Čistý zisk",
    productTableFooter: "Marže = 1 − cena zboží (COGS). Reklamní náklady rozpočítány podle podílu na obratu.",
  },
  en: {
    categoryWorstAlert: "Category {category} has the lowest POAS {poas} — at margin {margin} and revenue share {share} it is losing money. Consider a higher selling price or shifting ad budget elsewhere.",
    netProfitProducts: "Net profit (products)",
    marginVsCogs: "margin from selling price vs cost of goods",
    poasProducts: "POAS (products)",
    blendedMarginSub: "blended margin {value}",
    unprofitableCategories: "Unprofitable categories",
    belowBreakeven: "POAS below break-even",
    colCategory: "Category",
    colRevenueShare: "Revenue share",
    colRevenue: "Revenue",
    colCost: "Cost",
    colProductMargin: "Margin",
    colPoas: "POAS",
    colNetProfit: "Net profit",
    productTableFooter: "Margin = 1 − cost of goods (COGS). Ad cost allocated by revenue share.",
  },
} as const;

export default function ProfitProductsPanel({
  productResult,
  worstCategory,
}: {
  /** the category roll-up computed by the orchestrator (rows + summary) */
  productResult: { rows: ProductRow[]; summary: ProductSummary };
  /** the lowest-POAS category for the callout, or null when there are none */
  worstCategory: ProductRow | null;
}) {
  const fmt = useFormatters();
  const t = useT(T);

  return (
    <>
      {worstCategory && worstCategory.poas < 1 && (
        <div className="flex items-start gap-3 rounded-card border border-negative/30 bg-negative-soft px-4 py-3.5">
          <Layers width={18} height={18} className="mt-0.5 shrink-0 text-negative" />
          <p className="text-sm leading-relaxed text-navy-700">
            {t("categoryWorstAlert", {
              category: worstCategory.category,
              poas: fmt.fmtMultiple(worstCategory.poas),
              margin: fmt.fmtPct(worstCategory.marginPct),
              share: fmt.fmtPct(worstCategory.revenueShare),
            })}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("netProfitProducts")}</p>
          <p className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${productResult.summary.netProfit >= 0 ? "text-navy-800" : "text-negative"}`}>
            {fmt.fmtCZK(productResult.summary.netProfit)}
          </p>
          <p className="mt-1 text-xs text-muted">{t("marginVsCogs")}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("poasProducts")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
            {fmt.fmtMultiple(productResult.summary.poas)}
          </p>
          <p className="mt-1 text-xs text-muted">{t("blendedMarginSub", { value: fmt.fmtPct(productResult.summary.blendedMargin) })}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("unprofitableCategories")}</p>
          <p className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${productResult.summary.unprofitableCount > 0 ? "text-negative" : "text-positive"}`}>
            {productResult.summary.unprofitableCount}
          </p>
          <p className="mt-1 text-xs text-muted">{t("belowBreakeven")}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">{t("colCategory")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colRevenueShare")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colRevenue")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colCost")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colProductMargin")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colPoas")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colNetProfit")}</th>
              </tr>
            </thead>
            <tbody>
              {productResult.rows.map((r) => (
                <tr key={r.category} className="border-b border-line/70 last:border-0">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium text-navy-800">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                      {r.category}
                    </span>
                  </td>
                  <td className="tnum px-4 py-3 text-right text-muted">{fmt.fmtPct(r.revenueShare)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtCZKCompact(r.revenue)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtCZKCompact(r.cost)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtPct(r.marginPct)}</td>
                  <td className={`tnum px-4 py-3 text-right font-medium ${r.poas >= 1 ? "text-navy-800" : "text-negative"}`}>
                    {fmt.fmtMultiple(r.poas)}
                  </td>
                  <td className={`tnum px-4 py-3 text-right font-semibold ${r.netProfit >= 0 ? "text-positive" : "text-negative"}`}>
                    {fmt.fmtCZK(r.netProfit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-xs text-muted">
          <span>{t("productTableFooter")}</span>
        </div>
      </div>
    </>
  );
}
