"use client";

import {
  CAMPAIGN_TYPE_COLORS,
  CAMPAIGN_TYPE_LABELS,
  TARGET_ROAS,
  aggregate,
  groupByType,
  type Campaign,
} from "@/lib/campaigns/types";
import { fmtCZK, fmtCZKCompactA11y, fmtMultiple, fmtPct } from "@/lib/format";

export default function TypeBreakdown({ campaigns }: { campaigns: Campaign[] }) {
  const groups = groupByType(campaigns);
  const totalCost = aggregate(campaigns).cost || 1;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-navy-800">Srovnání podle typu kampaně</h2>
        <span className="text-xs text-muted">{groups.length} typů</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => {
          const t = g.total;
          const beats = t.roas >= TARGET_ROAS;
          const costShare = t.cost / totalCost;
          const convValue = fmtCZKCompactA11y(t.conversionValue);
          return (
            <div key={g.type} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: CAMPAIGN_TYPE_COLORS[g.type] }}
                    aria-hidden
                  />
                  <span className="text-sm font-semibold text-navy-800">
                    {CAMPAIGN_TYPE_LABELS[g.type]}
                  </span>
                </span>
                <span className="text-xs text-muted">{t.count} kamp.</span>
              </div>

              <div className="mt-3 flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted">ROAS</p>
                  <p className={`tnum text-2xl font-semibold ${beats ? "text-positive" : "text-navy-800"}`}>
                    {t.roas > 0 ? fmtMultiple(t.roas) : "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Hodnota konverzí</p>
                  <p className="tnum text-sm font-semibold text-navy-800" aria-label={convValue.label}>
                    {convValue.text}
                  </p>
                </div>
              </div>

              <div className="mt-3 border-t border-line pt-3">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Náklady {fmtCZK(t.cost)}</span>
                  <span>{fmtPct(costShare, 0)} výdajů</span>
                </div>
                <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-navy-50">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${costShare * 100}%`, backgroundColor: CAMPAIGN_TYPE_COLORS[g.type] }}
                  />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
