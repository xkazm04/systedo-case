/** Obsahový engine — topic clusters + content-decay refresh. Server component. */
import { Pill } from "@/components/ui";
import NextSteps from "@/components/app/NextSteps";
import { fmtInt, fmtPct, fmtSignedPct } from "@/lib/format";
import { clusterStats, decayingPosts } from "@/lib/content-engine/compute";
import type { DecayingPost, TopicCluster } from "@/lib/content-engine/sample";

export default function ContentEngineModule({
  clusters,
  decay,
}: {
  clusters: TopicCluster[];
  decay: DecayingPost[];
}) {
  const stats = clusters.map(clusterStats);
  const decaying = decayingPosts(decay);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {stats.map((c) => (
          <div key={c.topic} className="card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-navy-800">{c.topic}</h3>
              <span className="tnum text-xs text-muted">{fmtInt(c.volume)} obj./měs.</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-50">
                <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.round(c.coverage * 100)}%` }} />
              </span>
              <span className="tnum text-xs font-medium text-muted">
                {c.published}/{c.total} · {fmtPct(c.coverage)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.articles.map((a) => (
                <span
                  key={a.title}
                  className={`rounded-pill px-2.5 py-1 text-xs font-medium ${
                    a.status === "planned"
                      ? "border border-dashed border-line text-muted"
                      : a.type === "pillar"
                        ? "bg-brand-600 text-white"
                        : "bg-brand-50 text-brand-800"
                  }`}
                  title={a.type === "pillar" ? "Pilířový článek" : "Podpůrný článek"}
                >
                  {a.title}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-navy-800">Upadající obsah k obnově</h3>
          <Pill tone="coral">{decaying.length} k obnově</Pill>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Článek</th>
                <th className="px-4 py-3 text-right font-medium">Publikováno</th>
                <th className="px-4 py-3 text-right font-medium">Návštěvnost YoY</th>
                <th className="px-4 py-3 font-medium">Priorita</th>
              </tr>
            </thead>
            <tbody>
              {decaying.map((p) => (
                <tr key={p.title} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-800">{p.title}</td>
                  <td className="tnum px-4 py-3 text-right text-muted">před {p.monthsAgo} měs.</td>
                  <td className="tnum px-4 py-3 text-right font-semibold text-negative">{fmtSignedPct(p.trafficChangePct)}</td>
                  <td className="px-4 py-3">
                    <Pill tone={p.trafficChangePct <= -0.3 ? "negative" : "coral"}>
                      {p.trafficChangePct <= -0.3 ? "Vysoká" : "Střední"}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          Plánované články generujte přes Obsah (AI brief); upadající obnovte a znovu prolinkujte do
          klastru.
        </div>
      </div>

      <NextSteps
        steps={[
          { to: "obsah", label: "Vytvořit / obnovit obsah", hint: "AI brief pro plánované a upadající články" },
          { to: "distribuce", label: "Distribuovat", hint: "Rozšířit hotový obsah na kanály" },
        ]}
      />
    </div>
  );
}
