"use client";

/** The funnel evidence strip inside an expanded campaign row: impressions →
 *  clicks (CTR, CPC) → conversions (conversion rate), plus the day's budget
 *  pacing. The same CTR/CR/CPC numbers the AI prompt reasons from, so the human
 *  and the model look at identical figures.
 *
 *  Extracted from CampaignTable (with its own strings) so the table file keeps
 *  shrinking as the union read adds to it — the repo's ≤200-LOC ratchet. */
import { useFormatters, useT } from "@/lib/i18n/client";
import type { CampaignRow } from "@/lib/campaigns/types";

const T = {
  cs: {
    funnelHeading: "Trychtýř za období",
    funnelImpressions: "Zobrazení",
    funnelClicks: "Prokliky",
    funnelConversions: "Konverze",
    funnelConvRate: "konv. poměr",
    funnelBudget: "Rozpočet {budget}/den · čerpáno {pacing}",
  },
  en: {
    funnelHeading: "Funnel over the period",
    funnelImpressions: "Impressions",
    funnelClicks: "Clicks",
    funnelConversions: "Conversions",
    funnelConvRate: "conv. rate",
    funnelBudget: "Budget {budget}/day · {pacing} spent",
  },
} as const;

export default function RowFunnel({
  c,
  pacing,
  money,
}: {
  c: CampaignRow;
  /** the row's budget pacing, or null when it carries no budget */
  pacing: { pacing: number } | null;
  /** the currency-aware money formatter the table resolved */
  money: (n: number) => string;
}) {
  const t = useT(T);
  const fmt = useFormatters();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 text-sm">
      <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {t("funnelHeading")}
      </span>
      <span className="text-navy-700">
        <span className="text-xs text-muted">{t("funnelImpressions")}</span>{" "}
        <span className="tnum font-medium text-navy-800">{fmt.fmtInt(c.impressions)}</span>
      </span>
      <span className="text-muted" aria-hidden>→</span>
      <span className="text-navy-700">
        <span className="text-xs text-muted">{t("funnelClicks")}</span>{" "}
        <span className="tnum font-medium text-navy-800">{fmt.fmtInt(c.clicks)}</span>{" "}
        <span className="tnum text-xs text-muted">
          (CTR {c.impressions > 0 ? fmt.fmtPct(c.ctr, 2) : "—"} · CPC{" "}
          {c.clicks > 0 ? money(c.cpc) : "—"})
        </span>
      </span>
      <span className="text-muted" aria-hidden>→</span>
      <span className="text-navy-700">
        <span className="text-xs text-muted">{t("funnelConversions")}</span>{" "}
        <span className="tnum font-medium text-navy-800">{fmt.fmtInt(c.conversions)}</span>{" "}
        <span className="tnum text-xs text-muted">
          ({t("funnelConvRate")} {c.clicks > 0 ? fmt.fmtPct(c.convRate, 2) : "—"})
        </span>
      </span>
      {pacing && (
        <span className="tnum ml-auto text-xs text-muted">
          {t("funnelBudget", {
            budget: money(c.budgetPerDay ?? 0),
            pacing: fmt.fmtPct(pacing.pacing, 0),
          })}
        </span>
      )}
    </div>
  );
}
