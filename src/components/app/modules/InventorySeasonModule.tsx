/** Sklad & sezónnost — monthly seasonality index + stock-cover pacing, a
 *  seasonality-scaled budget plan, margin-weighted value-at-risk, and a proposed
 *  per-SKU budget change-set. Server component (static render). */
import { Pill, type PillTone } from "@/components/ui";
import { Calendar, Coins, Refresh } from "@/components/icons";
import NextSteps from "@/components/app/NextSteps";
import { fmtCZK, fmtDateShort, fmtInt, fmtMultiple, fmtPct, fmtSignedInt } from "@/lib/format";
import type {
  BudgetChangeSet,
  SeasonalBudgetPlan,
  SeasonMonth,
  StockRow,
  StockStatus,
} from "@/lib/inventory/compute";

const STATUS_META: Record<StockStatus, { tone: PillTone; label: string }> = {
  ok: { tone: "positive", label: "OK" },
  low: { tone: "coral", label: "Nízká" },
  pause: { tone: "negative", label: "Pauza" },
  resuming: { tone: "brand", label: "Obnovení" },
};

/** Tailwind text colour for the margin-at-risk cue: thin cover + healthy margin
 *  = most profit at stake, so it reads hottest. */
function marginRiskClass(row: StockRow): string {
  if (row.status === "pause") return "text-coral-600";
  if (row.status === "low" || row.status === "resuming") return "text-navy-800";
  return "text-navy-700";
}

export default function InventorySeasonModule({
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
  const maxIndex = Math.max(...season.map((s) => s.index), 1);
  const nextIndex = (currentMonth + 1) % 12;
  const next = season[nextIndex]!;
  const peak = season.reduce((a, b) => (b.index > a.index ? b : a), season[0]!);

  const lead =
    next.index >= 1.1
      ? `Nadcházející měsíc (${next.label}) bývá nad průměrem — index ${fmtMultiple(next.index)}. Připravte vyšší rozpočet a zásoby.`
      : next.index <= 0.9
        ? `Nadcházející měsíc (${next.label}) bývá pod průměrem — index ${fmtMultiple(next.index)}. Držte rozpočet a šetřete na špičku.`
        : `Nadcházející měsíc (${next.label}) je sezónně průměrný — index ${fmtMultiple(next.index)}.`;

  const pauseCount = stock.filter((s) => s.status === "pause").length;
  const atRiskCount = stock.filter((s) => s.atRisk).length;
  const resumingCount = stock.filter((s) => s.status === "resuming").length;
  // Value at risk = margin-weighted cover value of the items that can't run freely.
  const valueAtRisk = stock
    .filter((s) => s.status === "pause" || s.status === "low" || s.status === "resuming")
    .reduce((sum, s) => sum + s.coverValue, 0);

  return (
    <div className="space-y-6">
      {/* seasonality */}
      <div className="card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <Calendar width={18} height={18} className="text-brand-accent" />
            Sezónnost obratu
          </h3>
          <Pill tone="neutral">Špička: {peak.label}</Pill>
        </div>

        <div className="mt-5 flex items-end gap-1.5" style={{ height: 120 }}>
          {season.map((m) => {
            const h = Math.max(6, Math.round((m.index / maxIndex) * 104));
            const isCurrent = m.month === currentMonth;
            const isNext = m.month === nextIndex;
            const bg = isCurrent ? "bg-brand-600" : isNext ? "bg-brand-400" : "bg-brand-100";
            return (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="tnum text-[11px] text-muted">{fmtMultiple(m.index)}</span>
                <div className="flex w-full items-end" style={{ height: 104 }}>
                  <div className={`w-full rounded-t ${bg}`} style={{ height: h }} title={`${m.label}: ${fmtMultiple(m.index)}`} />
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

      {/* #3 seasonality-scaled budget plan */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <Coins width={18} height={18} className="text-brand-accent" />
            Plán rozpočtu podle sezóny
          </h3>
          <Pill tone="neutral">Základ {fmtCZK(budgetPlan.flatBudget)}/měs</Pill>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Měsíc</th>
                <th className="px-4 py-3 text-right font-medium">Index</th>
                <th className="px-4 py-3 text-right font-medium">Plán rozpočtu</th>
                <th className="px-4 py-3 text-right font-medium">Δ vs. rovnoměrně</th>
                <th className="px-5 py-3 font-medium">Pozn.</th>
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
                      <span className={`font-medium ${isCurrent ? "text-navy-900" : "text-navy-800"}`}>
                        {r.label}
                        {isCurrent ? " (nyní)" : ""}
                      </span>
                    </td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmtMultiple(r.index)}</td>
                    <td className="tnum px-4 py-3 text-right font-medium text-navy-800">{fmtCZK(r.plannedBudget)}</td>
                    <td
                      className={`tnum px-4 py-3 text-right ${
                        r.deltaVsFlat > 0 ? "text-positive" : r.deltaVsFlat < 0 ? "text-coral-600" : "text-muted"
                      }`}
                    >
                      {r.deltaVsFlat === 0 ? "—" : fmtSignedInt(r.deltaVsFlat)}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {r.isPeak && <Pill tone="brand">Špička</Pill>}
                        {r.capped && <Pill tone="coral">Zastropováno zásobou</Pill>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line text-sm font-semibold text-navy-800">
                <td className="px-5 py-3">Celkem za rok</td>
                <td className="px-4 py-3" />
                <td className="tnum px-4 py-3 text-right">{fmtCZK(budgetPlan.totalPlanned)}</td>
                <td className="tnum px-4 py-3 text-right text-muted">
                  {fmtSignedInt(budgetPlan.totalPlanned - budgetPlan.totalFlat)}
                </td>
                <td className="px-5 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* stock pacing — #5 margin column + value-at-risk, #2 resuming badge */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-navy-800">Skladová dostupnost &amp; rozpočet</h3>
          <div className="flex items-center gap-2">
            {resumingCount > 0 && <Pill tone="brand">{resumingCount} k obnovení</Pill>}
            {atRiskCount > 0 && <Pill tone="coral">{atRiskCount} brzy dojde</Pill>}
            {pauseCount > 0 ? (
              <Pill tone="negative">{pauseCount} k pozastavení</Pill>
            ) : (
              atRiskCount === 0 && resumingCount === 0 && <Pill tone="positive">Zásoby v pořádku</Pill>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Produkt</th>
                <th className="px-4 py-3 text-right font-medium">Sklad</th>
                <th className="px-4 py-3 text-right font-medium">Prodej/den</th>
                <th className="px-4 py-3 text-right font-medium">Dní zásoby</th>
                <th className="px-4 py-3 text-right font-medium">Marže</th>
                <th className="px-4 py-3 font-medium">Vyprodáno za</th>
                <th className="px-4 py-3 font-medium">Naplánované obnovení</th>
                <th className="px-4 py-3 font-medium">Stav</th>
                <th className="px-5 py-3 font-medium">Doporučení</th>
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
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(product.stock)} ks</td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{product.dailyVelocity.toFixed(1)}</td>
                    <td className={`tnum px-4 py-3 text-right font-medium ${marginRiskClass(row)}`}>
                      {Number.isFinite(daysOfCover) ? `${Math.round(daysOfCover)} dní` : "—"}
                    </td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmtPct(margin)}</td>
                    <td className="tnum px-4 py-3">
                      {stockoutAt ? (
                        <span className={atRisk ? "font-medium text-coral-600" : "text-navy-700"}>
                          {fmtDateShort(stockoutAt)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="tnum px-4 py-3">
                      {resumeAt ? (
                        <span className="flex items-center gap-1.5 font-medium text-brand-700">
                          <Refresh width={14} height={14} aria-hidden />
                          {fmtDateShort(resumeAt)}
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
                  Marží vážená hodnota v riziku (omezené SKU)
                </td>
                <td className="tnum px-4 py-3 text-right text-coral-600" colSpan={3}>
                  {fmtCZK(valueAtRisk)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* #1 per-SKU budget change-set proposal */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <Refresh width={18} height={18} className="text-brand-accent" />
            Navrhnout přesun rozpočtu
          </h3>
          {changeSet.moves.length > 0 && <Pill tone="brand">Přesun {fmtCZK(changeSet.totalShifted)}</Pill>}
        </div>
        {changeSet.moves.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            Žádný přesun není potřeba — všechny SKU mohou jet naplno.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Z (omezené SKU)</th>
                  <th className="px-4 py-3 font-medium">Do (rychloobrátkové SKU)</th>
                  <th className="px-4 py-3 font-medium">Kategorie</th>
                  <th className="px-5 py-3 text-right font-medium">Přesun</th>
                </tr>
              </thead>
              <tbody>
                {changeSet.moves.map((m) => (
                  <tr key={`${m.fromSku}->${m.toSku}`} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-3 text-navy-700">{m.fromTitle}</td>
                    <td className="px-4 py-3 font-medium text-navy-800">{m.toTitle}</td>
                    <td className="px-4 py-3 text-muted">{m.category}</td>
                    <td className="tnum px-5 py-3 text-right font-medium text-positive">+{fmtCZK(m.amountCzk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Pouze návrh — částky vycházejí z odhadu výdajů na SKU a neprovádějí žádnou změnu rozpočtu.
        </p>
      </div>

      <NextSteps steps={[{ to: "kampane", label: "Upravit rozpočet", hint: "Pozastavit reklamu u docházejících SKU" }]} />
    </div>
  );
}
