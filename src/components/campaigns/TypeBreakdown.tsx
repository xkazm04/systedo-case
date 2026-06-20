"use client";

import {
  CAMPAIGN_TYPE_COLORS,
  CAMPAIGN_TYPE_LABELS,
  TARGET_ROAS,
  aggregate,
  groupByType,
  type Campaign,
} from "@/lib/campaigns/types";
import { useFormatters, useT } from "@/lib/i18n/client";

const T = {
  cs: {
    heading: "Srovnání podle typu kampaně",
    typeCount: "{n} typů",
    campaignCount: "{n} kamp.",
    convValueLabel: "Hodnota konverzí",
    costLabel: "Náklady {cost}",
    spendShare: "{pct} výdajů",
  },
  en: {
    heading: "Breakdown by campaign type",
    typeCount: "{n} types",
    campaignCount: "{n} camp.",
    convValueLabel: "Conversion value",
    costLabel: "Cost {cost}",
    spendShare: "{pct} of spend",
  },
} as const;

export default function TypeBreakdown({ campaigns }: { campaigns: Campaign[] }) {
  const fmt = useFormatters();
  const t = useT(T);
  const groups = groupByType(campaigns);
  const totalCost = aggregate(campaigns).cost || 1;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-navy-800">{t("heading")}</h2>
        <span className="text-xs text-muted">{t("typeCount", { n: groups.length })}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => {
          const tot = g.total;
          const beats = tot.roas >= TARGET_ROAS;
          const costShare = tot.cost / totalCost;
          const convValue = fmt.fmtCZKCompactA11y(tot.conversionValue);
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
                <span className="text-xs text-muted">{t("campaignCount", { n: tot.count })}</span>
              </div>

              <div className="mt-3 flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted">ROAS</p>
                  <p className={`tnum text-2xl font-semibold ${beats ? "text-positive" : "text-navy-800"}`}>
                    {tot.roas > 0 ? fmt.fmtMultiple(tot.roas) : "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">{t("convValueLabel")}</p>
                  <p className="tnum text-sm font-semibold text-navy-800" aria-label={convValue.label}>
                    {convValue.text}
                  </p>
                </div>
              </div>

              <div className="mt-3 border-t border-line pt-3">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{t("costLabel", { cost: fmt.fmtCZK(tot.cost) })}</span>
                  <span>{t("spendShare", { pct: fmt.fmtPct(costShare, 0) })}</span>
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
