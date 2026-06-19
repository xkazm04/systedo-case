/** LP experimenty — landing-page A/B results per keyword cluster. Server component. */
import { Pill } from "@/components/ui";
import { Check, ArrowRight } from "@/components/icons";
import { fmtInt, fmtPct, fmtSignedPct } from "@/lib/format";
import { evaluate } from "@/lib/lp-exp/compute";
import type { LpExperiment } from "@/lib/lp-exp/sample";
import NextSteps from "@/components/app/NextSteps";
import LpVariantIdeasPanel, {
  type LpVariantSeed,
} from "@/components/app/modules/LpVariantIdeasPanel";

export default function LpExperimentsModule({ experiments }: { experiments: LpExperiment[] }) {
  const results = experiments.map(evaluate);
  // Lightweight projection handed to the AI panel: just the topic seed (cluster),
  // status and the control label — no compute / sample internals ship to the client.
  const seeds: LpVariantSeed[] = experiments.map((exp) => ({
    id: exp.id,
    cluster: exp.cluster,
    status: exp.status,
    controlLabel: exp.variants[0]?.label ?? "Kontrola",
  }));
  // A resolved experiment = the gated verdict from the trust-gate wave: a winner
  // that is statistically significant (a `done` test, or a `running` one that has
  // cleared both the confidence threshold and the sample-size gate). Only those
  // earn a ship-the-winner handoff — a leading-but-unproven arm routes nowhere.
  const shipped = results.filter((r) => r.significant && r.winner);

  return (
    <div className="space-y-4">
      {results.map((r) => {
        const maxCvr = Math.max(...r.variants.map((v) => v.cvr), 0.0001);
        // A running test below its target sample size is still collecting data —
        // gate the winner verdict so an under-powered peek can't read like a result.
        const collecting = r.status === "running" && !r.hasEnoughData;
        const progressPct = Math.round(r.progress * 100);
        return (
          <div key={r.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <div>
                <h3 className="text-base font-semibold text-navy-800">{r.cluster}</h3>
                <p className="text-xs text-muted">
                  Landing page experiment · {r.variants.length} varianty
                  {r.comparisons > 1 && (
                    <> · upraveno pro {r.variants.length} varianty</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone={r.status === "done" ? "neutral" : "brand"}>
                  {r.status === "done" ? "Ukončeno" : "Běží"}
                </Pill>
                {collecting ? (
                  <Pill tone="navy">Sbírá data — {progressPct} %</Pill>
                ) : r.winner ? (
                  <Pill tone={r.significant ? "positive" : "coral"}>
                    {r.significant ? `Vítěz (${fmtPct(r.confidence)} jistota)` : "Vede, zatím neprůkazné"}
                  </Pill>
                ) : (
                  <Pill tone="neutral">Bez rozdílu</Pill>
                )}
              </div>
            </div>

            {collecting && (
              <div className="mt-3">
                <span className="block h-2 overflow-hidden rounded-full bg-canvas">
                  <span
                    className="block h-full rounded-full bg-brand-400"
                    style={{ width: `${progressPct}%` }}
                  />
                </span>
                <p className="mt-1.5 text-xs text-muted">
                  Potřeba ~{fmtInt(r.requiredPerArm)} návštěvníků/varianta než vyhlásíme vítěze
                  {r.comparisons > 1 && <> (práh upraven pro {r.variants.length} varianty)</>}.
                </p>
              </div>
            )}

            <div className="mt-4 space-y-2.5">
              {r.variants.map((v) => (
                <div key={v.label} className="flex items-center gap-3">
                  <span className="flex w-44 shrink-0 flex-col gap-0.5 text-sm font-medium text-navy-800">
                    <span className="flex items-center gap-1.5">
                      {v.isWinner && !collecting && <Check width={14} height={14} className="text-positive" />}
                      {v.label}
                    </span>
                    {v.isWinner && !collecting && v.url && (
                      <a
                        href={v.url}
                        className="truncate text-xs font-normal text-brand-accent hover:underline"
                      >
                        {v.url}
                      </a>
                    )}
                  </span>
                  <span className="h-6 flex-1 overflow-hidden rounded-md bg-canvas">
                    <span
                      className={`block h-full rounded-md ${v.isWinner && !collecting ? "bg-positive" : v.isControl ? "bg-navy-200" : "bg-brand-400"}`}
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
      {shipped.length > 0 && (
        <div className="card border-positive/40 bg-positive/5 p-5">
          <div className="mb-4 flex items-start gap-2">
            <ArrowRight width={18} height={18} className="mt-0.5 shrink-0 text-positive" />
            <p className="text-sm text-navy-800">
              Máte {shipped.length === 1 ? "průkazného vítěze" : `${shipped.length} průkazné vítěze`} (
              {shipped.map((r) => r.cluster).join(", ")}). Posuňte je do navazujících modulů.
            </p>
          </div>
          <NextSteps
            steps={[
              {
                to: "obsah",
                label: "Aktualizovat vítěznou kopii",
                hint: "Přenést vítěznou variantu do briefu a článků",
              },
              {
                to: "srovnani-seo",
                label: "Rozšířit vítězný klastr",
                hint: "Postavit další high-intent stránky na vítězném klastru",
              },
              {
                to: "kampane",
                label: "Poslat provoz na novou LP",
                hint: "Nasměrovat rozpočet kampaní na vítěznou landing page",
              },
            ]}
          />
        </div>
      )}

      {seeds.length > 0 && <LpVariantIdeasPanel seeds={seeds} />}

      <p className="px-1 text-xs text-muted">
        Varianty lze generovat z klastrů klíčových slov (modul Srovnání &amp; SEO + Obsah) nebo přímo
        tlačítkem „Navrhnout varianty“ výše. Seam: reálné rozdělení návštěvnosti a analytika.
      </p>
    </div>
  );
}
