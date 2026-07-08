"use client";

import ChannelTable from "@/components/dashboard/ChannelTable";
import { Download } from "@/components/icons";
import { csvNum, downloadText, toCsv } from "@/lib/export";
import {
  periodLabel,
  type ChannelRow,
  type PeriodDef,
  type Significance,
  type Totals,
} from "@/lib/metrics";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const T = {
  cs: {
    channelsHeading: "Výkon podle kanálů",
    downloadTitle: "Stáhnout rozpad podle kanálů jako CSV",
    csvChannel: "Kanál",
    csvCost: "Náklady (Kč)",
    csvConversions: "Konverze",
    csvRevenue: "Obrat (Kč)",
    csvPno: "PNO",
    csvRoas: "ROAS",
    csvRevenueDelta: "Změna obratu",
    csvTotal: "Celkem",
  },
  en: {
    channelsHeading: "Performance by channel",
    downloadTitle: "Download channel breakdown as CSV",
    csvChannel: "Channel",
    csvCost: "Cost (CZK)",
    csvConversions: "Conversions",
    csvRevenue: "Revenue (CZK)",
    csvPno: "PNO",
    csvRoas: "ROAS",
    csvRevenueDelta: "Revenue change",
    csvTotal: "Total",
  },
} as const;

/** The by-channel performance section: heading, a CSV export of the breakdown
 *  for the selected period, and the comparison table. */
export default function ChannelsSection({
  channels,
  totals: c,
  goalPno,
  revenueDelta,
  revenueSignificance,
  period,
}: {
  channels: ChannelRow[];
  totals: Totals;
  goalPno: number;
  revenueDelta: number;
  revenueSignificance: Significance;
  period: PeriodDef;
}) {
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();

  // Money/counts as raw integers, ratios as locale-decimal cells (csvNum), so
  // Czech Excel parses "0,85" as a number instead of text/date.
  const exportChannelsCsv = () => {
    const headers = [
      t("csvChannel"),
      t("csvCost"),
      t("csvConversions"),
      t("csvRevenue"),
      t("csvPno"),
      t("csvRoas"),
      t("csvRevenueDelta"),
    ];
    const rows: (string | number)[][] = channels.map((r) => [
      r.channel,
      Math.round(r.cost),
      Math.round(r.conversions),
      Math.round(r.revenue),
      r.pno > 0 ? csvNum(r.pno, 4, locale) : "",
      r.roas > 0 ? csvNum(r.roas, 2, locale) : "",
      r.delta ? fmt.fmtSignedPct(r.delta.revenue) : "",
    ]);
    rows.push([
      t("csvTotal"),
      Math.round(c.cost),
      Math.round(c.conversions),
      Math.round(c.revenue),
      csvNum(c.pno, 4, locale),
      csvNum(c.roas, 2, locale),
      fmt.fmtSignedPct(revenueDelta),
    ]);
    downloadText(`adamant-kanaly-${period.key}.csv`, toCsv(headers, rows));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-navy-800">{t("channelsHeading")}</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{periodLabel(period, locale)}</span>
          <button
            type="button"
            onClick={exportChannelsCsv}
            title={t("downloadTitle")}
            className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
          >
            <Download width={14} height={14} />
            CSV
          </button>
        </div>
      </div>
      <ChannelTable
        rows={channels}
        totals={c}
        goalPno={goalPno}
        revenueDelta={revenueDelta}
        revenueSignificance={revenueSignificance}
      />
    </div>
  );
}
