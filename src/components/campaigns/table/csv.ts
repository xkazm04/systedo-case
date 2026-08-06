"use client";

/** CSV export for CampaignTable's currently filtered + sorted view — the
 *  cs-CZ-friendly deliverable agencies hand to clients, carrying triage
 *  severity, the top finding, and any loaded AI score. Extracted from the render
 *  component; reads only the passed-in in-memory state. */
import {
  CAMPAIGN_TYPE_LABELS,
  campaignStatusLabel,
  withMetrics,
} from "@/lib/campaigns/types";
import { severityLabel, triage, triageReasonLabel } from "@/lib/campaigns/triage";
import { csvNum, toCsv, downloadText } from "@/lib/export";
import type { CampaignReport } from "@/lib/ai-types";
import type { TFn } from "@/lib/i18n/interpolate";

/** A table row: a with-metrics campaign paired with its triage classification. */
export type CampaignRow = {
  c: ReturnType<typeof withMetrics>;
  tr: ReturnType<typeof triage>;
};

type Locale = Parameters<typeof campaignStatusLabel>[1];

/** The cs/en dict keys this exporter reads — a subset of CampaignTable's dict, so
 *  the component's translator (which covers the full union) is assignable here. */
type CsvKey =
  | "colCampaign"
  | "csvFilename"
  | "csvType"
  | "csvStatus"
  | "csvImpressions"
  | "csvClicks"
  | "colCost"
  | "colConversions"
  | "colConvValue"
  | "csvConvRate"
  | "colPriority"
  | "csvReason"
  | "csvScore";

/** Build the cs-CZ-friendly CSV and trigger a download of the currently
 *  filtered + sorted view. */
export function exportCampaignsCsv({
  view,
  reports,
  t,
  locale,
}: {
  view: CampaignRow[];
  reports: Record<string, CampaignReport>;
  t: TFn<CsvKey>;
  locale: Locale;
}): void {
  const headers = [
    t("colCampaign"), t("csvType"), t("csvStatus"),
    t("csvImpressions"), t("csvClicks"), t("colCost"),
    t("colConversions"), t("colConvValue"), "ROAS", "PNO %",
    "CTR %", "CPC", t("csvConvRate"),
    t("colPriority"), t("csvReason"), t("csvScore"),
  ];
  const rows = view.map(({ c, tr }) => [
    c.name,
    CAMPAIGN_TYPE_LABELS[c.type],
    campaignStatusLabel(c.status, locale),
    Math.round(c.impressions),
    Math.round(c.clicks),
    Math.round(c.cost),
    Math.round(c.conversions),
    Math.round(c.conversionValue),
    c.roas > 0 ? csvNum(c.roas, 2, locale) : "",
    c.pno > 0 ? csvNum(c.pno * 100, 1, locale) : "",
    // Funnel ratios — the agency deliverable carries the full causal layer;
    // zero-denominator cells stay empty, matching the on-screen "—". Ratio
    // cells go through csvNum so Czech Excel parses them as numbers.
    c.impressions > 0 ? csvNum(c.ctr * 100, 2, locale) : "",
    c.clicks > 0 ? csvNum(c.cpc, 2, locale) : "",
    c.clicks > 0 ? csvNum(c.convRate * 100, 2, locale) : "",
    severityLabel(tr.severity, locale),
    tr.primary ? triageReasonLabel(tr.primary, locale) : "",
    reports[c.id]?.result.score ?? "",
  ]);
  // Filename through the catalog, like ActivityFeed / SavedKeywordLists: an English
  // user downloading a Czech-named file is the same defect as a Czech header row.
  downloadText(t("csvFilename"), toCsv(headers, rows));
}
