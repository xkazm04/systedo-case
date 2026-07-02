"use client";

import { Gauge } from "@/components/icons";
import type { SnapshotSummaryPoint } from "@/lib/campaigns/triage";
import { useFormatters, useT } from "@/lib/i18n/client";

const T = {
  cs: {
    heading: "Vývoj zdraví portfolia",
    subtitle: "pravidlová triáž nad uloženými snímky · jeden sloupec = jedna synchronizace",
    critical1: "{n} kritická",
    critical234: "{n} kritické",
    criticalN: "{n} kritických",
    deltaFewer: "o {n} méně než při minulé synchronizaci",
    deltaMore: "o {n} více než při minulé synchronizaci",
    deltaSame: "beze změny proti minulé synchronizaci",
    allClear: "Bez kritických nálezů",
    pointTitle: "{date}: {critical} krit. · {warning} sledovat · {ok} v pořádku",
    chartAria: "Časová osa zdraví portfolia přes {n} synchronizací",
  },
  en: {
    heading: "Portfolio health over time",
    subtitle: "rule-based triage over stored snapshots · one column = one sync",
    critical1: "{n} critical",
    critical234: "{n} critical",
    criticalN: "{n} critical",
    deltaFewer: "{n} fewer than at the previous sync",
    deltaMore: "{n} more than at the previous sync",
    deltaSame: "unchanged since the previous sync",
    allClear: "No critical findings",
    pointTitle: "{date}: {critical} critical · {warning} watch · {ok} on target",
    chartAria: "Portfolio health timeline across {n} syncs",
  },
} as const;

const COL_W = 12;
const GAP = 5;
const CHART_H = 44;

/** Deterministic portfolio-health strip — the rule-based counterpart of the AI
 *  score timeline. Every sync appended a full snapshot that nothing ever read
 *  beyond the latest diff; this renders the last N of them as stacked
 *  critical/warning columns (hand-rolled SVG, no chart lib), with a headline
 *  comparing the latest sync against the previous one. Free: no AI evaluation
 *  needs to have run. Renders nothing until two syncs exist. */
export default function HealthTimeline({ points }: { points: SnapshotSummaryPoint[] }) {
  const fmt = useFormatters();
  const t = useT(T);

  if (points.length < 2) return null;

  const latest = points[points.length - 1]!.summary;
  const prev = points[points.length - 2]!.summary;
  const maxAttention = Math.max(1, ...points.map((p) => p.summary.attention));

  const criticalKey =
    latest.critical === 1 ? "critical1" : latest.critical >= 2 && latest.critical <= 4 ? "critical234" : "criticalN";
  const deltaC = latest.critical - prev.critical;
  const deltaLabel =
    deltaC < 0
      ? t("deltaFewer", { n: Math.abs(deltaC) })
      : deltaC > 0
        ? t("deltaMore", { n: deltaC })
        : t("deltaSame");

  const width = points.length * (COL_W + GAP) - GAP;

  return (
    <div className="card flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-navy-800">
          <Gauge width={15} height={15} className="shrink-0 text-brand-600" aria-hidden />
          {t("heading")}
        </p>
        <p className="mt-0.5 text-xs text-muted">{t("subtitle")}</p>
      </div>
      <p className="text-sm">
        {latest.critical > 0 ? (
          <span className="font-semibold text-negative">
            <span className="tnum">{t(criticalKey, { n: latest.critical })}</span>
          </span>
        ) : (
          <span className="font-semibold text-positive">{t("allClear")}</span>
        )}{" "}
        <span className="text-muted">— {deltaLabel}</span>
      </p>
      <svg
        width={width}
        height={CHART_H}
        viewBox={`0 0 ${width} ${CHART_H}`}
        role="img"
        aria-label={t("chartAria", { n: points.length })}
        className="ml-auto shrink-0"
      >
        {points.map((p, i) => {
          const x = i * (COL_W + GAP);
          const s = p.summary;
          // Stacked columns: critical (bottom, red) + warning (coral) scaled to
          // the busiest sync; an all-clear sync renders a small positive tick.
          const hCrit = Math.round((s.critical / maxAttention) * (CHART_H - 4));
          const hWarn = Math.round((s.warning / maxAttention) * (CHART_H - 4));
          const title = t("pointTitle", {
            date: fmt.fmtDateShort(p.syncedAt),
            critical: s.critical,
            warning: s.warning,
            ok: s.ok,
          });
          return (
            <g key={p.syncedAt}>
              <title>{title}</title>
              {s.attention === 0 ? (
                <rect x={x} y={CHART_H - 3} width={COL_W} height={3} rx={1.5} fill="var(--color-positive)" />
              ) : (
                <>
                  {hWarn > 0 && (
                    <rect
                      x={x}
                      y={CHART_H - hCrit - hWarn}
                      width={COL_W}
                      height={hWarn}
                      rx={1.5}
                      fill="var(--color-coral-500)"
                      opacity={0.85}
                    />
                  )}
                  {hCrit > 0 && (
                    <rect
                      x={x}
                      y={CHART_H - hCrit}
                      width={COL_W}
                      height={hCrit}
                      rx={1.5}
                      fill="var(--color-negative)"
                    />
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
