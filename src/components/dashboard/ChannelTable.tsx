import type { ChannelRow, Totals } from "@/lib/metrics";
import { fmtCZK, fmtInt, fmtMultiple, fmtPct } from "@/lib/format";

/** Colour PNO relative to the agreed goal: efficient = green, on plan = neutral,
 *  over budget = coral. Organic (cost 0) is treated as fully efficient. */
function pnoTone(pno: number, goal: number): string {
  if (pno <= 0) return "text-positive";
  if (pno <= goal * 1.05) return "text-positive";
  if (pno >= goal * 1.6) return "text-negative";
  return "text-navy-700";
}

export default function ChannelTable({
  rows,
  totals,
  goalPno,
}: {
  rows: ChannelRow[];
  totals: Totals;
  goalPno: number;
}) {
  const maxShare = Math.max(...rows.map((r) => r.revenueShare), 0.0001);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-3 font-semibold">Kanál</th>
              <th className="px-3 py-3 text-right font-semibold">Náklady</th>
              <th className="px-3 py-3 text-right font-semibold">Konverze</th>
              <th className="px-5 py-3 text-right font-semibold">Obrat</th>
              <th className="px-3 py-3 text-right font-semibold">PNO</th>
              <th className="px-5 py-3 text-right font-semibold">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.channel} className="border-b border-line/70 last:border-0 hover:bg-canvas/60">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: r.color }}
                      aria-hidden
                    />
                    <span className="font-medium text-navy-800">{r.channel}</span>
                  </div>
                </td>
                <td className="tnum px-3 py-3 text-right text-navy-700">{fmtCZK(r.cost)}</td>
                <td className="tnum px-3 py-3 text-right text-navy-700">{fmtInt(r.conversions)}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-col items-end gap-1">
                    <span className="tnum font-medium text-navy-800">{fmtCZK(r.revenue)}</span>
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-navy-50">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(r.revenueShare / maxShare) * 100}%`,
                          backgroundColor: r.color,
                        }}
                      />
                    </span>
                  </div>
                </td>
                <td className={`tnum px-3 py-3 text-right font-medium ${pnoTone(r.pno, goalPno)}`}>
                  {r.pno > 0 ? fmtPct(r.pno) : "—"}
                </td>
                <td className="tnum px-5 py-3 text-right text-navy-700">
                  {r.roas > 0 ? fmtMultiple(r.roas) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line bg-canvas/50 font-semibold text-navy-800">
              <td className="px-5 py-3">Celkem</td>
              <td className="tnum px-3 py-3 text-right">{fmtCZK(totals.cost)}</td>
              <td className="tnum px-3 py-3 text-right">{fmtInt(totals.conversions)}</td>
              <td className="tnum px-5 py-3 text-right">{fmtCZK(totals.revenue)}</td>
              <td className="tnum px-3 py-3 text-right">{fmtPct(totals.pno)}</td>
              <td className="tnum px-5 py-3 text-right">{fmtMultiple(totals.roas)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
