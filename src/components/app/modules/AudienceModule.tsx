/** Publikum & výnos — audience funnel, segments and revenue. Server component. */
import { fmtCZK, fmtCZKCompact, fmtInt, fmtPct } from "@/lib/format";
import { Pill } from "@/components/ui";
import NextSteps from "@/components/app/NextSteps";
import { audienceSummary, segmentRevenue, sourceAttribution } from "@/lib/audience/compute";
import type { AudienceFunnel, RevenueStream, Segment, SubscriberSource } from "@/lib/audience/sample";

export default function AudienceModule({
  funnel,
  segments,
  revenue,
  subscriberSources,
}: {
  funnel: AudienceFunnel;
  segments: Segment[];
  revenue: RevenueStream[];
  subscriberSources: SubscriberSource[];
}) {
  const s = audienceSummary(funnel, revenue);
  const maxStream = Math.max(...revenue.map((r) => r.amount), 1);
  const attribution = sourceAttribution(subscriberSources);
  const maxShare = Math.max(...attribution.rows.map((r) => r.share), 0.0001);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Odběratelé</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtInt(funnel.subscribers)}</p>
          <p className="mt-1 text-xs text-muted">konverze {fmtPct(s.subRate)} z návštěv</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Aktivní</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtPct(s.activeRate)}</p>
          <p className="mt-1 text-xs text-muted">{fmtInt(funnel.activeSubscribers)} odběratelů</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Měsíční výnos</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtCZKCompact(s.monthlyRevenue)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">ARPU</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-brand-accent">{fmtCZK(s.arpu)}</p>
          <p className="mt-1 text-xs text-muted">na aktivního odběratele</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* segments */}
        <div className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h3 className="text-base font-semibold text-navy-800">Segmenty</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Segment</th>
                  <th className="px-4 py-3 text-right font-medium">Odběratelé</th>
                  <th className="px-4 py-3 text-right font-medium">Open rate</th>
                  <th className="px-4 py-3 text-right font-medium">RPM</th>
                  <th className="px-4 py-3 text-right font-medium">Odhad výnosu</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((seg) => (
                  <tr key={seg.name} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-3 font-medium text-navy-800">{seg.name}</td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(seg.subscribers)}</td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmtPct(seg.openRate)}</td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmtCZK(seg.rpm)}</td>
                    <td className="tnum px-4 py-3 text-right font-medium text-navy-800">{fmtCZKCompact(segmentRevenue(seg))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* revenue streams */}
        <div className="card p-5">
          <h3 className="text-base font-semibold text-navy-800">Zdroje výnosu</h3>
          <div className="mt-4 space-y-3">
            {revenue.map((r) => (
              <div key={r.source}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-navy-700">{r.source}</span>
                  <span className="tnum font-medium text-navy-800">{fmtCZKCompact(r.amount)}</span>
                </div>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-navy-50">
                  <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.round((r.amount / maxStream) * 100)}%` }} />
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
            Seam: napojit ESP (newsletter), analytiku a data o sponzoringu/reklamě.
          </p>
        </div>
      </div>

      {/* subscriber-source attribution — kde rostou odběratelé */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-navy-800">Zdroje odběratelů</h3>
            <p className="mt-0.5 text-xs text-muted">
              {fmtInt(attribution.totalNewSubs)} nových odběratelů · průměrná cena za získání{" "}
              {attribution.blendedCostPerSub > 0 ? fmtCZK(attribution.blendedCostPerSub) : "—"} (placené kanály)
            </p>
          </div>
          {attribution.lowestRetentionSource && (
            <Pill tone="coral">Nejnižší retence: {attribution.lowestRetentionSource}</Pill>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Kanál</th>
                <th className="px-4 py-3 text-right font-medium">Noví odběratelé</th>
                <th className="px-4 py-3 font-medium">Podíl</th>
                <th className="px-4 py-3 text-right font-medium">Cena / odběratel</th>
                <th className="px-4 py-3 text-right font-medium">Retence 30 dní</th>
              </tr>
            </thead>
            <tbody>
              {attribution.rows.map((r) => (
                <tr key={r.source} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-800">{r.source}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(r.newSubs)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className="block h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-navy-50">
                        <span
                          className="block h-full rounded-full bg-brand-500"
                          style={{ width: `${Math.round((r.share / maxShare) * 100)}%` }}
                        />
                      </span>
                      <span className="tnum shrink-0 text-xs text-muted">{fmtPct(r.share)}</span>
                    </span>
                  </td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">
                    {r.costPerSub !== undefined ? fmtCZK(r.costPerSub) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.lowestRetention ? (
                      <Pill tone="coral">{fmtPct(r.retention30, 0)}</Pill>
                    ) : (
                      <span className="tnum text-navy-700">{fmtPct(r.retention30, 0)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Organické kanály nemají cenu za získání; průměr počítá jen z placených zdrojů.
        </p>
      </div>

      <NextSteps
        steps={[
          {
            to: "distribuce",
            label: "Posílit nejsilnější kanál",
            hint: "Atribuce podle kanálu a varianty obsahu v Distribuci",
          },
        ]}
      />
    </div>
  );
}
