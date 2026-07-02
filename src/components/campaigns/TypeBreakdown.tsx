"use client";

import {
  CAMPAIGN_TYPE_COLORS,
  CAMPAIGN_TYPE_LABELS,
  TARGET_ROAS,
  aggregate,
  groupByType,
  withMetrics,
  type Campaign,
  type CampaignChange,
  type CampaignType,
} from "@/lib/campaigns/types";
import { summarize } from "@/lib/campaigns/triage";
import { useFormatters, useT } from "@/lib/i18n/client";

const T = {
  cs: {
    heading: "Srovnání podle typu kampaně",
    typeCount: "{n} typů",
    campaignCount: "{n} kamp.",
    convValueLabel: "Hodnota konverzí",
    costLabel: "Náklady {cost}",
    spendShare: "{pct} výdajů",
    attention1: "{n} vyžaduje pozornost",
    attention234: "{n} vyžadují pozornost",
    attentionN: "{n} vyžaduje pozornost",
    filterTitle: "Filtrovat tabulku kampaní na typ {type}",
    filterActiveTitle: "Zrušit filtr typu {type}",
  },
  en: {
    heading: "Breakdown by campaign type",
    typeCount: "{n} types",
    campaignCount: "{n} camp.",
    convValueLabel: "Conversion value",
    costLabel: "Cost {cost}",
    spendShare: "{pct} of spend",
    attention1: "{n} needs attention",
    attention234: "{n} need attention",
    attentionN: "{n} need attention",
    filterTitle: "Filter the campaign table to type {type}",
    filterActiveTitle: "Clear the {type} type filter",
  },
} as const;

export default function TypeBreakdown({
  campaigns,
  changesById,
  activeType,
  onTypeClick,
}: {
  campaigns: Campaign[];
  /** per-campaign-id diff vs the prior sync — lets the per-type attention count
   *  agree with the table's change-aware triage (optional; snapshot-only otherwise) */
  changesById?: Record<string, CampaignChange>;
  /** the lifted table type-filter, so the active card highlights */
  activeType?: CampaignType | "all";
  /** click-to-filter: toggle the table's type filter to this card's type.
   *  Omitted on read-only surfaces (the shared client report) — cards stay
   *  plain, non-interactive tiles there. */
  onTypeClick?: (type: CampaignType) => void;
}) {
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
          // Per-type triage rollup — an aggregate ROAS can look fine while the
          // group hides two critical campaigns; the pill stops that masking.
          const attention = summarize(g.campaigns.map(withMetrics), changesById).attention;
          const attentionKey =
            attention === 1 ? "attention1" : attention >= 2 && attention <= 4 ? "attention234" : "attentionN";
          const active = activeType === g.type;
          const typeLabel = CAMPAIGN_TYPE_LABELS[g.type];

          // span-only body so the same markup is valid inside a <button>
          const body = (
            <>
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: CAMPAIGN_TYPE_COLORS[g.type] }}
                    aria-hidden
                  />
                  <span className="text-sm font-semibold text-navy-800">{typeLabel}</span>
                </span>
                <span className="text-xs text-muted">{t("campaignCount", { n: tot.count })}</span>
              </span>

              {attention > 0 && (
                <span className="mt-2 inline-flex">
                  <span className="pill bg-coral-soft text-coral-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                    {t(attentionKey, { n: attention })}
                  </span>
                </span>
              )}

              <span className="mt-3 flex items-end justify-between">
                <span className="block">
                  <span className="block text-xs text-muted">ROAS</span>
                  <span className={`tnum block text-2xl font-semibold ${beats ? "text-positive" : "text-navy-800"}`}>
                    {tot.roas > 0 ? fmt.fmtMultiple(tot.roas) : "—"}
                  </span>
                </span>
                <span className="block text-right">
                  <span className="block text-xs text-muted">{t("convValueLabel")}</span>
                  <span className="tnum block text-sm font-semibold text-navy-800" aria-label={convValue.label}>
                    {convValue.text}
                  </span>
                </span>
              </span>

              <span className="mt-3 block border-t border-line pt-3">
                <span className="flex items-center justify-between text-xs text-muted">
                  <span>{t("costLabel", { cost: fmt.fmtCZK(tot.cost) })}</span>
                  <span>{t("spendShare", { pct: fmt.fmtPct(costShare, 0) })}</span>
                </span>
                <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-navy-50">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${costShare * 100}%`, backgroundColor: CAMPAIGN_TYPE_COLORS[g.type] }}
                  />
                </span>
              </span>
            </>
          );

          // Interactive card only when the parent wired the filter — the shared
          // read-only report renders the same tile without button semantics.
          return onTypeClick ? (
            <button
              key={g.type}
              type="button"
              onClick={() => onTypeClick(g.type)}
              aria-pressed={active}
              title={t(active ? "filterActiveTitle" : "filterTitle", { type: typeLabel })}
              className={`card p-4 text-left transition-shadow ${
                active ? "ring-2 ring-brand-400" : "hover:shadow-card"
              }`}
            >
              {body}
            </button>
          ) : (
            <div key={g.type} className="card p-4">
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
