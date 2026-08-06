/** The weekly digest's "Přehled týdne" insight brief (Direction 2): the week's
 *  top computed insights, drawn from the SAME deterministic engine + selection the
 *  dashboard's InsightsPanel uses (buildInsightLines), so the email never invents a
 *  parallel narrative. Pure — no store, no LLM: the caller resolves the dataset
 *  (live-when-synced, else the honest sample) and this ranks + renders it. The
 *  provenance label keeps the integrity line honest (client's own data vs sample).
 *
 *  Framework-free so it unit-tests without the cron I/O. */
import type { PerformanceData } from "@/lib/types";
import type { SupportedLocale } from "@/lib/format";
import { createFormatters } from "@/lib/format";
import { buildMetricsSnapshot, PERIODS, weekdayProfile } from "@/lib/metrics";
import { escapeHtml } from "@/lib/html";
import {
  buildInsightLines,
  makeInsightT,
  type InsightLine,
} from "@/components/dashboard/vykon/insight-lines";

/** How many insights the brief carries — the top of the significance ranking. */
export const DIGEST_INSIGHT_COUNT = 3;

/** The window the brief measures: the dashboard's default view, so the email
 *  matches what the client sees when they open Výkon. */
export const DIGEST_INSIGHT_PERIOD_KEY = "90d";

const HEADER = {
  cs: "Přehled týdne",
  en: "Weekly brief",
} as const;

/** cs/en provenance label for the brief header — the integrity signal that keeps
 *  sample-derived output from ever reading as the client's own data. */
export function provenanceLabel(live: boolean, locale: SupportedLocale): string {
  if (locale === "en") return live ? "Live data" : "Sample data";
  return live ? "Živá data" : "Ukázková data";
}

/** The top-N ranked insight lines for a resolved dataset, via the shared selection
 *  the dashboard panel uses. Pure: buildMetricsSnapshot + weekdayProfile are numbers
 *  in, numbers out. `windowEndDate` is "" — the email never navigates, so the lines'
 *  chart actions are irrelevant here. */
export function selectDigestInsights(
  data: PerformanceData,
  locale: SupportedLocale
): InsightLine[] {
  const period = PERIODS.find((p) => p.key === DIGEST_INSIGHT_PERIOD_KEY) ?? PERIODS[2];
  const snap = buildMetricsSnapshot(data, {
    key: period.key,
    label: period.label,
    days: period.days,
    granularity: period.granularity,
    baseline: "previous",
  });
  const fmt = createFormatters(locale);
  const t = makeInsightT(locale);
  return buildInsightLines(
    {
      channels: snap.channels,
      revenueDelta: snap.delta.revenue,
      pno: snap.current.pno,
      goalPno: snap.goals.pno,
      trends: snap.trends,
      // Reuse the snapshot's weekday-weights bundle instead of re-deriving a
      // revenue weekday pass the build already ran.
      profile: weekdayProfile(data.daily, "revenue", snap.weekdayWeights.revenue),
      funnel: snap.funnel,
      significance: snap.significance,
      baseline: snap.baseline,
      windowEndDate: "",
    },
    fmt,
    t,
    locale
  ).slice(0, DIGEST_INSIGHT_COUNT);
}

/** The brief's inbox-alert body: provenance header + the insight lines, or "" when
 *  there is nothing worth surfacing (the section is then omitted, never filler). */
export function insightBriefAlertBody(
  lines: InsightLine[],
  live: boolean,
  locale: SupportedLocale
): string {
  if (lines.length === 0) return "";
  const header = `${HEADER[locale] ?? HEADER.cs} (${provenanceLabel(live, locale)})`;
  return `${header}: ${lines.map((l) => l.line).join(" · ")}`;
}

/** The brief's email section (HTML), or "" when there are no insights so the email
 *  omits the section entirely rather than showing an empty heading. */
export function insightBriefHtml(
  lines: InsightLine[],
  live: boolean,
  locale: SupportedLocale
): string {
  if (lines.length === 0) return "";
  const header = `${HEADER[locale] ?? HEADER.cs} (${provenanceLabel(live, locale)})`;
  const items = lines
    .map((l) => `<li style="margin:6px 0">${escapeHtml(l.line)}</li>`)
    .join("");
  return `<p style="margin-top:16px"><strong>${escapeHtml(header)}</strong></p><ul>${items}</ul>`;
}
