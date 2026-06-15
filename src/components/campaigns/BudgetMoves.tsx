import { ArrowRight, Bolt, Check } from "@/components/icons";
import { recommendBudgetMoves } from "@/lib/campaigns/budget-moves";
import { withMetrics, type Campaign } from "@/lib/campaigns/types";
import { fmtCZK, fmtMultiple, fmtPct, fmtSignedPct } from "@/lib/format";

/** Deterministic "what to do now" panel: pairs under-target spenders with
 *  over-performers and shows the projected portfolio lift. No AI, instant — the
 *  bridge from the triage diagnosis to a quantified action. */
export default function BudgetMoves({ campaigns }: { campaigns: Campaign[] }) {
  const { moves, simulation } = recommendBudgetMoves(campaigns.map(withMetrics));
  const { before, after } = simulation;
  const valueGain = after.conversionValue - before.conversionValue;

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <Bolt width={18} height={18} className="text-brand-600" />
            Doporučené přesuny rozpočtu
          </h2>
          <p className="mt-1 text-sm text-muted">
            Deterministický návrh: přesun rozpočtu od podvýkonných kampaní k těm nad cílem.
          </p>
        </div>
        <span className="pill shrink-0 self-start bg-navy-50 text-muted">bez AI · okamžité</span>
      </div>

      {moves.length === 0 ? (
        <div className="mt-5 flex items-center gap-2.5 rounded-card bg-positive-soft px-4 py-3 text-sm text-positive">
          <Check width={18} height={18} className="shrink-0" />
          Rozpočet je vůči cíli vyvážený — žádné zjevné přesuny se nenabízejí.
        </div>
      ) : (
        <>
          <ul className="mt-5 space-y-3">
            {moves.map((m, i) => (
              <li key={i} className="rounded-card border border-line p-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
                  <span className="font-semibold text-navy-800">Přesunout {fmtCZK(m.amount)}</span>
                  <span className="inline-flex items-center gap-1.5 text-navy-700">
                    z <span className="font-medium">{m.fromName}</span>
                    <span className="tnum text-negative">ROAS {fmtMultiple(m.fromRoas)}</span>
                  </span>
                  <ArrowRight width={15} height={15} className="text-muted" aria-label="do" />
                  <span className="inline-flex items-center gap-1.5 text-navy-700">
                    <span className="font-medium">{m.toName}</span>
                    <span className="tnum text-positive">ROAS {fmtMultiple(m.toRoas)}</span>
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  Odhadovaný přínos:{" "}
                  <span className="tnum font-semibold text-positive">+{fmtCZK(m.estValueGain)}</span>{" "}
                  hodnoty konverzí.
                </p>
              </li>
            ))}
          </ul>

          {/* projected portfolio impact */}
          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
            <Impact
              label="ROAS portfolia"
              before={fmtMultiple(before.roas)}
              after={fmtMultiple(after.roas)}
              good={after.roas >= before.roas}
            />
            <Impact
              label="PNO portfolia"
              before={fmtPct(before.pno)}
              after={fmtPct(after.pno)}
              good={after.pno <= before.pno}
            />
            <Impact
              label="Hodnota konverzí"
              before={fmtCZK(before.conversionValue)}
              after={fmtCZK(after.conversionValue)}
              good={valueGain >= 0}
            />
            <div className="bg-surface p-3">
              <p className="text-xs text-muted">Změna hodnoty</p>
              <p
                className={`tnum mt-1 text-lg font-semibold ${
                  valueGain >= 0 ? "text-positive" : "text-negative"
                }`}
              >
                {fmtSignedPct(before.conversionValue > 0 ? valueGain / before.conversionValue : 0)}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Odhad lineárně extrapoluje současnou efektivitu kampaní; skutečný dopad ověří
            další synchronizace.
          </p>
        </>
      )}
    </section>
  );
}

function Impact({
  label,
  before,
  after,
  good,
}: {
  label: string;
  before: string;
  after: string;
  good: boolean;
}) {
  return (
    <div className="bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5 text-sm">
        <span className="tnum text-muted line-through">{before}</span>
        <span className={`tnum text-lg font-semibold ${good ? "text-positive" : "text-navy-800"}`}>
          {after}
        </span>
      </p>
    </div>
  );
}
