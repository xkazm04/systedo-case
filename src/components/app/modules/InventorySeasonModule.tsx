/** Sklad & sezónnost — monthly seasonality index + stock-cover pacing, a
 *  seasonality-scaled budget plan, margin-weighted value-at-risk, and a proposed
 *  per-SKU budget change-set. Server component (static render). */
import { Pill, type PillTone } from "@/components/ui";
import { Calendar, Coins, Refresh } from "@/components/icons";
import NextSteps from "@/components/app/NextSteps";
import InventoryBudgetActions from "@/components/app/modules/InventoryBudgetActions";
import { getServerFormatters, getT } from "@/lib/i18n/server";
import { buildActionPlan } from "@/lib/inventory/action-plan";
import type {
  BudgetChangeSet,
  SeasonalBudgetPlan,
  SeasonMonth,
  StockRow,
  StockStatus,
} from "@/lib/inventory/compute";

const T = {
  cs: {
    statusOk: "OK",
    statusLow: "Nízká",
    statusPause: "Pauza",
    statusResuming: "Obnovení",
    seasonTitle: "Sezónnost obratu",
    peak: "Špička: {label}",
    leadAbove: "Nadcházející měsíc ({month}) bývá nad průměrem — index {idx}. Připravte vyšší rozpočet a zásoby.",
    leadBelow: "Nadcházející měsíc ({month}) bývá pod průměrem — index {idx}. Držte rozpočet a šetřete na špičku.",
    leadAvg: "Nadcházející měsíc ({month}) je sezónně průměrný — index {idx}.",
    budgetPlanTitle: "Plán rozpočtu podle sezóny",
    budgetBase: "Základ {amount}/měs",
    colMonth: "Měsíc",
    colIndex: "Index",
    colPlannedBudget: "Plán rozpočtu",
    colDeltaFlat: "Δ vs. rovnoměrně",
    colNote: "Pozn.",
    currentSuffix: " (nyní)",
    peakBadge: "Špička",
    cappedBadge: "Zastropováno zásobou",
    totalYear: "Celkem za rok",
    stockTitle: "Skladová dostupnost & rozpočet",
    resuming: "{n} k obnovení",
    atRisk: "{n} brzy dojde",
    pause: "{n} k pozastavení",
    stockOk: "Zásoby v pořádku",
    colProduct: "Produkt",
    colStock: "Sklad",
    colDailySales: "Prodej/den",
    colDaysOfCover: "Dní zásoby",
    colMargin: "Marže",
    colStockoutAt: "Vyprodáno za",
    colResumeAt: "Naplánované obnovení",
    colStatus: "Stav",
    colAction: "Doporučení",
    stockUnits: "{n} ks",
    daysOfCover: "{n} dní",
    valueAtRisk: "Marží vážená hodnota v riziku (omezené SKU)",
    budgetShiftTitle: "Navrhnout přesun rozpočtu",
    shiftTotal: "Přesun {amount}",
    noShift: "Žádný přesun není potřeba — všechny SKU mohou jet naplno.",
    colFrom: "Z (omezené SKU)",
    colTo: "Do (rychloobrátkové SKU)",
    colCategory: "Kategorie",
    colShift: "Přesun",
    shiftNote: "Pouze návrh — částky vycházejí z odhadu výdajů na SKU a neprovádějí žádnou změnu rozpočtu.",
    nextStep: "Upravit rozpočet",
    nextStepHint: "Pozastavit reklamu u docházejících SKU",
  },
  en: {
    statusOk: "OK",
    statusLow: "Low",
    statusPause: "Paused",
    statusResuming: "Resuming",
    seasonTitle: "Revenue seasonality",
    peak: "Peak: {label}",
    leadAbove: "Next month ({month}) is typically above average — index {idx}. Prepare a higher budget and stock.",
    leadBelow: "Next month ({month}) is typically below average — index {idx}. Hold budget and save for the peak.",
    leadAvg: "Next month ({month}) is seasonally average — index {idx}.",
    budgetPlanTitle: "Seasonal budget plan",
    budgetBase: "Base {amount}/mo",
    colMonth: "Month",
    colIndex: "Index",
    colPlannedBudget: "Planned budget",
    colDeltaFlat: "Δ vs. flat",
    colNote: "Note",
    currentSuffix: " (now)",
    peakBadge: "Peak",
    cappedBadge: "Capped by stock",
    totalYear: "Full-year total",
    stockTitle: "Stock availability & budget",
    resuming: "{n} resuming",
    atRisk: "{n} running low",
    pause: "{n} to pause",
    stockOk: "Stock OK",
    colProduct: "Product",
    colStock: "Stock",
    colDailySales: "Sales/day",
    colDaysOfCover: "Days cover",
    colMargin: "Margin",
    colStockoutAt: "Stockout by",
    colResumeAt: "Planned restock",
    colStatus: "Status",
    colAction: "Recommendation",
    stockUnits: "{n} units",
    daysOfCover: "{n} days",
    valueAtRisk: "Margin-weighted value at risk (constrained SKUs)",
    budgetShiftTitle: "Propose budget shift",
    shiftTotal: "Shift {amount}",
    noShift: "No shift needed — all SKUs can run at full budget.",
    colFrom: "From (constrained SKU)",
    colTo: "To (fast-moving SKU)",
    colCategory: "Category",
    colShift: "Shift",
    shiftNote: "Proposal only — amounts are based on estimated per-SKU spend and make no actual budget change.",
    nextStep: "Adjust budget",
    nextStepHint: "Pause ads for low-stock SKUs",
  },
} as const;

/** Tailwind text colour for the margin-at-risk cue: thin cover + healthy margin
 *  = most profit at stake, so it reads hottest. */
function marginRiskClass(row: StockRow): string {
  if (row.status === "pause") return "text-coral-600";
  if (row.status === "low" || row.status === "resuming") return "text-navy-800";
  return "text-navy-700";
}

export default async function InventorySeasonModule({
  season,
  currentMonth,
  stock,
  budgetPlan,
  changeSet,
}: {
  season: SeasonMonth[];
  currentMonth: number;
  stock: StockRow[];
  budgetPlan: SeasonalBudgetPlan;
  changeSet: BudgetChangeSet;
}) {
  const fmt = await getServerFormatters();
  const t = await getT(T);

  const STATUS_META: Record<StockStatus, { tone: PillTone; label: string }> = {
    ok: { tone: "positive", label: t("statusOk") },
    low: { tone: "coral", label: t("statusLow") },
    pause: { tone: "negative", label: t("statusPause") },
    resuming: { tone: "brand", label: t("statusResuming") },
  };

  const maxIndex = Math.max(...season.map((s) => s.index), 1);
  const nextIndex = (currentMonth + 1) % 12;
  const next = season[nextIndex]!;
  const peak = season.reduce((a, b) => (b.index > a.index ? b : a), season[0]!);

  const lead =
    next.index >= 1.1
      ? t("leadAbove", { month: next.label, idx: fmt.fmtMultiple(next.index) })
      : next.index <= 0.9
        ? t("leadBelow", { month: next.label, idx: fmt.fmtMultiple(next.index) })
        : t("leadAvg", { month: next.label, idx: fmt.fmtMultiple(next.index) });

  const pauseCount = stock.filter((s) => s.status === "pause").length;
  const atRiskCount = stock.filter((s) => s.atRisk).length;
  const resumingCount = stock.filter((s) => s.status === "resuming").length;
  // Value at risk = margin-weighted cover value of the items that can't run freely.
  const valueAtRisk = stock
    .filter((s) => s.status === "pause" || s.status === "low" || s.status === "resuming")
    .reduce((sum, s) => sum + s.coverValue, 0);

  // Direction 3: the proposal becomes an executable, governed, cross-channel plan.
  const actionPlan = buildActionPlan(stock, changeSet);

  return (
    <div className="stagger space-y-6">
      {/* seasonality */}
      <div className="card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <Calendar width={18} height={18} className="text-brand-accent" />
            {t("seasonTitle")}
          </h3>
          <Pill tone="neutral">{t("peak", { label: peak.label })}</Pill>
        </div>

        <div className="mt-5 flex items-end gap-1.5" style={{ height: 120 }}>
          {season.map((m) => {
            const h = Math.max(6, Math.round((m.index / maxIndex) * 104));
            const isCurrent = m.month === currentMonth;
            const isNext = m.month === nextIndex;
            const bg = isCurrent ? "bg-brand-600" : isNext ? "bg-brand-400" : "bg-brand-100";
            return (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="tnum text-[11px] text-muted">{fmt.fmtMultiple(m.index)}</span>
                <div className="flex w-full items-end" style={{ height: 104 }}>
                  <div className={`w-full rounded-t ${bg}`} style={{ height: h }} title={`${m.label}: ${fmt.fmtMultiple(m.index)}`} />
                </div>
                <span className={`text-[11px] ${isCurrent ? "font-semibold text-navy-800" : "text-muted"}`}>
                  {m.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-card border border-line bg-canvas px-4 py-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
          <p className="text-sm leading-relaxed text-navy-700">{lead}</p>
        </div>
      </div>

      {/* seasonality-scaled budget plan */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <Coins width={18} height={18} className="text-brand-accent" />
            {t("budgetPlanTitle")}
          </h3>
          <Pill tone="neutral">{t("budgetBase", { amount: fmt.fmtCZK(budgetPlan.flatBudget) })}</Pill>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">{t("colMonth")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colIndex")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colPlannedBudget")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colDeltaFlat")}</th>
                <th className="px-5 py-3 font-medium">{t("colNote")}</th>
              </tr>
            </thead>
            <tbody>
              {budgetPlan.rows.map((r) => {
                const isCurrent = r.month === currentMonth;
                return (
                  <tr
                    key={r.month}
                    className={`border-b border-line/70 last:border-0 ${r.isPeak ? "bg-brand-50/60" : ""}`}
                  >
                    <td className="px-5 py-3">
                      <span className={`font-medium ${isCurrent ? "text-ink" : "text-navy-800"}`}>
                        {r.label}
                        {isCurrent ? t("currentSuffix") : ""}
                      </span>
                    </td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtMultiple(r.index)}</td>
                    <td className="tnum px-4 py-3 text-right font-medium text-navy-800">{fmt.fmtCZK(r.plannedBudget)}</td>
                    <td
                      className={`tnum px-4 py-3 text-right ${
                        r.deltaVsFlat > 0 ? "text-positive" : r.deltaVsFlat < 0 ? "text-coral-600" : "text-muted"
                      }`}
                    >
                      {r.deltaVsFlat === 0 ? "—" : fmt.fmtSignedInt(r.deltaVsFlat)}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {r.isPeak && <Pill tone="brand">{t("peakBadge")}</Pill>}
                        {r.capped && <Pill tone="coral">{t("cappedBadge")}</Pill>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line text-sm font-semibold text-navy-800">
                <td className="px-5 py-3">{t("totalYear")}</td>
                <td className="px-4 py-3" />
                <td className="tnum px-4 py-3 text-right">{fmt.fmtCZK(budgetPlan.totalPlanned)}</td>
                <td className="tnum px-4 py-3 text-right text-muted">
                  {fmt.fmtSignedInt(budgetPlan.totalPlanned - budgetPlan.totalFlat)}
                </td>
                <td className="px-5 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* stock pacing */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-navy-800">{t("stockTitle")}</h3>
          <div className="flex items-center gap-2">
            {resumingCount > 0 && <Pill tone="brand">{t("resuming", { n: resumingCount })}</Pill>}
            {atRiskCount > 0 && <Pill tone="coral">{t("atRisk", { n: atRiskCount })}</Pill>}
            {pauseCount > 0 ? (
              <Pill tone="negative">{t("pause", { n: pauseCount })}</Pill>
            ) : (
              atRiskCount === 0 && resumingCount === 0 && <Pill tone="positive">{t("stockOk")}</Pill>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">{t("colProduct")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colStock")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colDailySales")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colDaysOfCover")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colMargin")}</th>
                <th className="px-4 py-3 font-medium">{t("colStockoutAt")}</th>
                <th className="px-4 py-3 font-medium">{t("colResumeAt")}</th>
                <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
                <th className="px-5 py-3 font-medium">{t("colAction")}</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((row) => {
                const { product, daysOfCover, status, action, stockoutAt, atRisk, resumeAt, margin } = row;
                const meta = STATUS_META[status];
                return (
                  <tr key={product.sku} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2.5 font-medium text-navy-800">
                        <span className="text-lg">{product.emoji}</span>
                        <span className="truncate">{product.title}</span>
                      </span>
                    </td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{t("stockUnits", { n: fmt.fmtInt(product.stock) })}</td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtDecimal(product.dailyVelocity, 1)}</td>
                    <td className={`tnum px-4 py-3 text-right font-medium ${marginRiskClass(row)}`}>
                      {Number.isFinite(daysOfCover) ? t("daysOfCover", { n: Math.round(daysOfCover) }) : "—"}
                    </td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtPct(margin)}</td>
                    <td className="tnum px-4 py-3">
                      {stockoutAt ? (
                        <span className={atRisk ? "font-medium text-coral-600" : "text-navy-700"}>
                          {fmt.fmtDateShort(stockoutAt)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="tnum px-4 py-3">
                      {resumeAt ? (
                        <span className="flex items-center gap-1.5 font-medium text-brand-700">
                          <Refresh width={14} height={14} aria-hidden />
                          {fmt.fmtDateShort(resumeAt)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={meta.tone}>{meta.label}</Pill>
                    </td>
                    <td className="px-5 py-3 text-muted">{action}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line text-sm font-semibold text-navy-800">
                <td className="px-5 py-3" colSpan={6}>
                  {t("valueAtRisk")}
                </td>
                <td className="tnum px-4 py-3 text-right text-coral-600" colSpan={3}>
                  {fmt.fmtCZK(valueAtRisk)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* per-SKU budget change-set — now an executable, governed action plan */}
      <InventoryBudgetActions plan={actionPlan} />

      <NextSteps steps={[{ to: "kampane", label: t("nextStep"), hint: t("nextStepHint") }]} />
    </div>
  );
}
