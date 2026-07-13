"use client";

import { Calendar } from "@/components/icons";
import type { WeekdayProfilePoint } from "@/lib/metrics";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { SupportedLocale } from "@/lib/format";
import { weekdayName } from "@/components/dashboard/vykon/plural";

const T = {
  cs: {
    heading: "Profil podle dní v týdnu",
    scope: "obrat · posledních 12 týdnů",
    average: "Ø = průměrný den",
    line: "Nejsilnější je {best} ({bestPct} nad průměrem), nejslabší {worst} ({worstPct} pod průměrem) — vodítko pro rozvrh reklam a úpravy nabídek podle dne.",
    flat: "Výkon je rozložený rovnoměrně — žádný den výrazně nevybočuje.",
    barTitle: "{day}: {pct} oproti průměru",
  },
  en: {
    heading: "Weekday profile",
    scope: "revenue · last 12 weeks",
    average: "Ø = average day",
    line: "{best} is the strongest ({bestPct} above average), {worst} the weakest ({worstPct} below) — a guide for ad scheduling and day-of-week bid adjustments.",
    flat: "Performance is spread evenly — no weekday stands out.",
    barTitle: "{day}: {pct} vs the average",
  },
} as const;

/** Two-letter axis labels, indexed by UTC day-of-week (0 = Sunday). */
const DAY_SHORT: Record<SupportedLocale, string[]> = {
  cs: ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"],
  en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
};

/** Monday-first display order (Czech + European convention). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

// --- geometry (viewBox units; the svg scales responsively) -------------------
const W = 280;
const CHART_H = 116;
const BASELINE_Y = 56;
/** max bar excursion from the baseline */
const AMPL = 34;
/** minimum deviation the y-scale is sized for, so a calm profile doesn't zoom
 *  tiny wiggles into a dramatic skyline */
const MIN_SCALE = 0.15;
const SLOT = W / 7;
const BAR_W = 24;

/**
 * Compact deviation-bar mini-chart of the day-of-week performance profile the
 * engine already computes (weekdayProfile): one bar per weekday, anchored at
 * the "average day" baseline, above-average days in brand ink and below-average
 * days in a recessive neutral so the shape reads as seasonality, not alarm.
 * Only the best and worst days carry a direct label; every bar has a native
 * tooltip with the exact figure.
 */
export default function WeekdayProfileCard({ profile }: { profile: WeekdayProfilePoint[] }) {
  const t = useT(T);
  const fmt = useFormatters();
  const { locale } = useLocale();

  const best = profile.find((p) => p.best);
  const worst = profile.find((p) => p.worst);
  const flat = !best || !worst;

  // Symmetric y-scale sized to the largest deviation (with a floor).
  const scale = Math.max(MIN_SCALE, ...profile.map((p) => Math.abs(p.index - 1)));

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-navy-800">
        <Calendar width={17} height={17} className="text-brand-600" />
        {t("heading")}
        <span className="ml-auto text-xs font-normal text-muted">{t("scope")}</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${CHART_H}`}
        className="mt-3 w-full"
        role="img"
        aria-label={
          flat
            ? t("flat")
            : t("line", {
                best: weekdayName(best.day, locale),
                bestPct: fmt.fmtPct(best.index - 1, 0).replace("-", ""),
                worst: weekdayName(worst.day, locale),
                worstPct: fmt.fmtPct(1 - worst.index, 0).replace("-", ""),
              })
        }
      >
        {/* the "average day" baseline the bars deviate from */}
        <line
          x1={0}
          x2={W}
          y1={BASELINE_Y}
          y2={BASELINE_Y}
          stroke="var(--color-line)"
          strokeDasharray="3 3"
        />
        <text x={W - 2} y={BASELINE_Y - 4} textAnchor="end" fontSize={9} fill="var(--color-muted)">
          Ø
        </text>

        {WEEK_ORDER.map((day, i) => {
          const p = profile[day];
          const dev = p.index - 1;
          const h = Math.max(1.5, (Math.abs(dev) / scale) * AMPL);
          const up = dev >= 0;
          const x = i * SLOT + (SLOT - BAR_W) / 2;
          const y = up ? BASELINE_Y - h : BASELINE_Y;
          const fill = up
            ? p.best
              ? "var(--color-brand-600)"
              : "var(--color-brand-500)"
            : p.worst
              ? "var(--color-navy-300)"
              : "var(--color-navy-200)";
          const pct = fmt.fmtSignedPct(dev, 0);
          const label = p.best || p.worst;
          return (
            <g key={day}>
              <rect x={x} y={y} width={BAR_W} height={h} rx={2} fill={fill}>
                <title>
                  {t("barTitle", { day: weekdayName(day, locale), pct })}
                </title>
              </rect>
              {/* selective direct labels — only the extremes, in ink not series color */}
              {label && (
                <text
                  x={x + BAR_W / 2}
                  y={up ? y - 4 : y + h + 10}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--color-navy-700)"
                  className="tnum"
                >
                  {pct}
                </text>
              )}
              <text
                x={x + BAR_W / 2}
                y={CHART_H - 4}
                textAnchor="middle"
                fontSize={10}
                fill="var(--color-muted)"
              >
                {(DAY_SHORT[locale] ?? DAY_SHORT.cs)[day]}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="mt-2 text-[13px] leading-snug text-muted">
        {flat
          ? t("flat")
          : t("line", {
              best: weekdayName(best.day, locale),
              bestPct: fmt.fmtPct(best.index - 1, 0).replace("-", ""),
              worst: weekdayName(worst.day, locale),
              worstPct: fmt.fmtPct(1 - worst.index, 0).replace("-", ""),
            })}{" "}
        <span className="whitespace-nowrap">({t("average")})</span>
      </p>
    </div>
  );
}
