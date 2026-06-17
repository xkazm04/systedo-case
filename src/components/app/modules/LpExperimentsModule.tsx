/** LP experimenty — landing-page A/B results per keyword cluster. Server component. */
import { Pill } from "@/components/ui";
import { Check } from "@/components/icons";
import { fmtInt, fmtPct, fmtSignedPct } from "@/lib/format";
import { evaluate } from "@/lib/lp-exp/compute";
import type { LpExperiment } from "@/lib/lp-exp/sample";

export default function LpExperimentsModule({ experiments }: { experiments: LpExperiment[] }) {
  const results = experiments.map(evaluate);

  return (
    <div className="space-y-4">
      {results.map((r) => {
        const maxCvr = Math.max(...r.variants.map((v) => v.cvr), 0.0001);
        return (
          <div key={r.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <div>
                <h3 className="text-base font-semibold text-navy-800">{r.cluster}</h3>
                <p className="text-xs text-muted">Landing page experiment · {r.variants.length} varianty</p>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone={r.status === "done" ? "neutral" : "brand"}>
                  {r.status === "done" ? "Ukončeno" : "Běží"}
                </Pill>
                {r.winner ? (
                  <Pill tone={r.significant ? "positive" : "coral"}>
                    {r.significant ? `Vítěz (${fmtPct(r.confidence)} jistota)` : "Vede, zatím neprůkazné"}
                  </Pill>
                ) : (
                  <Pill tone="neutral">Bez rozdílu</Pill>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {r.variants.map((v) => (
                <div key={v.label} className="flex items-center gap-3">
                  <span className="flex w-44 shrink-0 items-center gap-1.5 text-sm font-medium text-navy-800">
                    {v.isWinner && <Check width={14} height={14} className="text-positive" />}
                    {v.label}
                  </span>
                  <span className="h-6 flex-1 overflow-hidden rounded-md bg-canvas">
                    <span
                      className={`block h-full rounded-md ${v.isWinner ? "bg-positive" : v.isControl ? "bg-navy-200" : "bg-brand-400"}`}
                      style={{ width: `${Math.round((v.cvr / maxCvr) * 100)}%` }}
                    />
                  </span>
                  <span className="tnum w-16 shrink-0 text-right text-sm font-semibold text-navy-800">{fmtPct(v.cvr)}</span>
                  <span className="tnum hidden w-28 shrink-0 text-right text-xs text-muted sm:block">
                    {fmtInt(v.signups)} / {fmtInt(v.visitors)}
                  </span>
                  <span
                    className={`tnum w-16 shrink-0 text-right text-xs font-medium ${
                      v.isControl ? "text-muted" : v.uplift >= 0 ? "text-positive" : "text-negative"
                    }`}
                  >
                    {v.isControl ? "—" : fmtSignedPct(v.uplift)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <p className="px-1 text-xs text-muted">
        Varianty lze generovat z klastrů klíčových slov (modul Srovnání & SEO + Obsah). Seam: reálné
        rozdělení návštěvnosti a analytika.
      </p>
    </div>
  );
}
