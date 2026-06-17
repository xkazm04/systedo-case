/** CAC → LTV — cohort economics for an app/SaaS project. Server component. */
import { Bulb } from "@/components/icons";
import { fmtCZK, fmtInt, fmtMultiple, fmtPct } from "@/lib/format";
import type { CohortMetrics, LtvSummary } from "@/lib/ltv/compute";

function ratioTone(r: number): string {
  if (r >= 3) return "text-positive";
  if (r >= 1) return "text-navy-800";
  return "text-negative";
}

export default function LtvModule({
  rows,
  summary,
}: {
  rows: CohortMetrics[];
  summary: LtvSummary;
}) {
  const healthy = summary.avgLtvCac >= 3;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Blended CAC</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtCZK(summary.blendedCac)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">LTV : CAC</p>
          <p className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${ratioTone(summary.avgLtvCac)}`}>
            {fmtMultiple(summary.avgLtvCac)}
          </p>
          <p className="mt-1 text-xs text-muted">cíl ≥ 3,0×</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Návratnost</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
            {summary.avgPayback != null ? `${summary.avgPayback.toFixed(1)} měs.` : "—"}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Placené registrace</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtInt(summary.signups)}</p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-card border border-line bg-canvas px-4 py-3.5">
        <Bulb width={18} height={18} className={`mt-0.5 shrink-0 ${healthy ? "text-positive" : "text-coral-600"}`} />
        <p className="text-sm leading-relaxed text-navy-700">
          {healthy
            ? "Jednotková ekonomika je zdravá (LTV:CAC ≥ 3). Akvizici lze škálovat — optimalizujte na dobu návratnosti, ne na počet registrací."
            : "LTV:CAC je pod cílem 3×. Než přidáte rozpočet, zlepšete retenci/ARPU nebo snižte CAC — jinak rychlejší akvizice prohlubuje ztrátu."}
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Kohorta</th>
                <th className="px-4 py-3 text-right font-medium">Registrace</th>
                <th className="px-4 py-3 text-right font-medium">CAC</th>
                <th className="px-4 py-3 text-right font-medium">M3 retence</th>
                <th className="px-4 py-3 text-right font-medium">LTV</th>
                <th className="px-4 py-3 text-right font-medium">LTV:CAC</th>
                <th className="px-4 py-3 text-right font-medium">Návratnost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-800">{r.month}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(r.signups)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtCZK(r.cac)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtPct(r.m3)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtCZK(r.ltv)}</td>
                  <td className={`tnum px-4 py-3 text-right font-semibold ${ratioTone(r.ltvCac)}`}>
                    {fmtMultiple(r.ltvCac)}
                  </td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">
                    {r.paybackMonth != null ? `${r.paybackMonth} měs.` : "> 12 měs."}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          LTV počítáno na {12} měsíců s extrapolací retenční křivky. Seam: napojit události z product
          analytics (Segment / PostHog / Stripe).
        </div>
      </div>
    </div>
  );
}
