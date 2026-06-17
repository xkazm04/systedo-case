/** Sklad & sezónnost — monthly seasonality index + stock-cover pacing. Server
 *  component (static render). */
import { Pill, type PillTone } from "@/components/ui";
import { Calendar } from "@/components/icons";
import NextSteps from "@/components/app/NextSteps";
import { fmtInt, fmtMultiple } from "@/lib/format";
import type { SeasonMonth, StockRow, StockStatus } from "@/lib/inventory/compute";

const STATUS_META: Record<StockStatus, { tone: PillTone; label: string }> = {
  ok: { tone: "positive", label: "OK" },
  low: { tone: "coral", label: "Nízká" },
  pause: { tone: "negative", label: "Pauza" },
};

export default function InventorySeasonModule({
  season,
  currentMonth,
  stock,
}: {
  season: SeasonMonth[];
  currentMonth: number;
  stock: StockRow[];
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

      {/* stock pacing */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-navy-800">Skladová dostupnost & rozpočet</h3>
          {pauseCount > 0 ? (
            <Pill tone="negative">{pauseCount} k pozastavení</Pill>
          ) : (
            <Pill tone="positive">Zásoby v pořádku</Pill>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Produkt</th>
                <th className="px-4 py-3 text-right font-medium">Sklad</th>
                <th className="px-4 py-3 text-right font-medium">Prodej/den</th>
                <th className="px-4 py-3 text-right font-medium">Dní zásoby</th>
                <th className="px-4 py-3 font-medium">Stav</th>
                <th className="px-5 py-3 font-medium">Doporučení</th>
              </tr>
            </thead>
            <tbody>
              {stock.map(({ product, daysOfCover, status, action }) => {
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
                    <td className="tnum px-4 py-3 text-right font-medium text-navy-800">
                      {Number.isFinite(daysOfCover) ? `${Math.round(daysOfCover)} dní` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={meta.tone}>{meta.label}</Pill>
                    </td>
                    <td className="px-5 py-3 text-muted">{action}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <NextSteps steps={[{ to: "kampane", label: "Upravit rozpočet", hint: "Pozastavit reklamu u docházejících SKU" }]} />
    </div>
  );
}
