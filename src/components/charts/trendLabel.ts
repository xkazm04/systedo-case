import type { SupportedLocale } from "@/lib/format";

/** Default screen-reader phrasing for a Sparkline's trend summary, in the chart's
 *  locale. Pure + dependency-free so it can be unit-tested and so Sparkline's
 *  fallback aria-label stops hard-coding Czech. Callers wanting bespoke wording
 *  still pass their own `describeLabel`; this is only the default. */
export function trendAriaLabel(
  locale: SupportedLocale,
  parts: { start: string; end: string; pct: string }
): string {
  return locale === "cs"
    ? `Trend od ${parts.start} do ${parts.end}, změna ${parts.pct}`
    : `Trend from ${parts.start} to ${parts.end}, change ${parts.pct}`;
}
