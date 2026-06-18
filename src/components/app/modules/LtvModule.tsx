/** CAC → LTV — cohort economics for an app/SaaS project. Server component. */
import { Bulb } from "@/components/icons";
import NextSteps from "@/components/app/NextSteps";
import { fmtCZK, fmtInt, fmtMultiple, fmtPct } from "@/lib/format";
import type { CohortMetrics, LtvSummary } from "@/lib/ltv/compute";
import { FALLBACK_CHANNEL_COLOR, LTV_CHANNEL_COLORS } from "@/lib/ltv/sample";

function ratioTone(r: number): string {
  if (r >= 3) return "text-positive";
  if (r >= 1) return "text-navy-800";
  return "text-negative";
}

/** Blended per-channel economics across all cohorts that carry a breakdown:
 *  spend-weighted CAC, signup-weighted payback, and the resulting LTV per signup. */
interface BlendedChannel {
  channel: string;
  spend: number;
  signups: number;
  paid: boolean;
  cac: number;
  ltvCac: number;
  /** signup-weighted average payback month, or null when never recovered */
  paybackMonth: number | null;
}

function blendChannels(rows: CohortMetrics[]): BlendedChannel[] {
  // Accumulate per channel: spend, signups, LTV value (ltv-per-user × signups),
  // and a signup-weighted payback (only over cohorts where it recovers).
  const acc = new Map<
    string,
    { spend: number; signups: number; paid: boolean; ltvValue: number; paybackNum: number; paybackDen: number }
  >();
  for (const r of rows) {
    const ltvPerUser = r.ltv;
    for (const m of r.channelMetrics) {
      const a =
        acc.get(m.channel) ?? { spend: 0, signups: 0, paid: m.paid, ltvValue: 0, paybackNum: 0, paybackDen: 0 };
      a.spend += m.spend;
      a.signups += m.signups;
      a.ltvValue += ltvPerUser * m.signups;
      if (m.paybackMonth != null) {
        a.paybackNum += m.paybackMonth * m.signups;
        a.paybackDen += m.signups;
      }
      acc.set(m.channel, a);
    }
  }
  return [...acc.entries()]
    .map(([channel, a]) => {
      const cac = a.signups > 0 ? a.spend / a.signups : 0;
      const ltvPerSignup = a.signups > 0 ? a.ltvValue / a.signups : 0;
      return {
        channel,
        spend: a.spend,
        signups: a.signups,
        paid: a.paid,
        cac,
        ltvCac: cac > 0 ? ltvPerSignup / cac : 0,
        paybackMonth: a.paybackDen > 0 ? a.paybackNum / a.paybackDen : null,
      } satisfies BlendedChannel;
    })
    .sort((x, y) => y.spend - x.spend);
}

function channelColor(channel: string): string {
  return LTV_CHANNEL_COLORS[channel] ?? FALLBACK_CHANNEL_COLOR;
}

export default function LtvModule({
  rows,
  summary,
}: {
  rows: CohortMetrics[];
  summary: LtvSummary;
}) {
  const healthy = summary.avgLtvCac >= 3;
  const channels = blendChannels(rows);
  const maxRatio = Math.max(...channels.map((x) => x.ltvCac), 1);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Blended CAC</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtCZK(summary.blendedCac)}</p>
          <p className="mt-1 text-xs text-muted">vč. organické / přímé</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Placené CAC</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtCZK(summary.paidCac)}</p>
          <p className="mt-1 text-xs text-muted">{fmtInt(summary.paidSignups)} placených registrací</p>
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

      {channels.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-line px-5 py-3.5">
            <p className="text-sm font-semibold text-navy-800">CAC a návratnost podle akvizičního kanálu</p>
            <p className="mt-0.5 text-xs text-muted">
              Placené i organické kanály z kohort s rozpadem. LTV:CAC sdílí hodnotu zákazníka kohorty.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Kanál</th>
                  <th className="px-4 py-3 text-right font-medium">Registrace</th>
                  <th className="px-4 py-3 text-right font-medium">CAC</th>
                  <th className="px-4 py-3 text-right font-medium">Návratnost</th>
                  <th className="px-4 py-3 text-right font-medium">LTV:CAC</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                    <tr key={c.channel} className="border-b border-line/70 last:border-0">
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2 font-medium text-navy-800">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: channelColor(c.channel) }}
                          />
                          {c.channel}
                          {!c.paid && (
                            <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                              zdarma
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(c.signups)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">
                        {c.paid ? fmtCZK(c.cac) : "—"}
                      </td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">
                        {c.paybackMonth != null ? `${c.paybackMonth.toFixed(1)} měs.` : "> 12 měs."}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center justify-end gap-2">
                          <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-line sm:block">
                            <span
                              className="block h-full rounded-full bg-brand-accent"
                              style={{ width: `${Math.min(100, (c.ltvCac / maxRatio) * 100)}%` }}
                            />
                          </span>
                          <span className={`tnum font-semibold ${ratioTone(c.ltvCac)}`}>
                            {c.ltvCac > 0 ? fmtMultiple(c.ltvCac) : "—"}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-5 py-3 text-xs text-muted">
            CAC je vlastní útrata kanálu na registraci; organické / přímé kanály mají nulové akviziční
            náklady, proto se nezapočítávají do placené CAC.
          </div>
        </div>
      )}

      <NextSteps
        steps={[
          {
            to: "kampane",
            label: "Přesunout rozpočet",
            hint: "Přidat do kanálů s nejlepší LTV:CAC, omezit drahé na registraci",
          },
        ]}
      />
    </div>
  );
}
