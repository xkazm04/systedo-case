"use client";

/** Cross-project portfolio comparison — one row per project on a uniform cross-type
 *  spine (revenue · cost · conversions · ROAS · PNO) plus a 12-month revenue
 *  sparkline, so any two projects read on the same axis. The active project (the
 *  route's [projectId]) is highlighted. Replaces the single-project KPI band on the
 *  Overview when a workspace holds more than one project. */
import Sparkline from "@/components/charts/Sparkline";
import { ModuleIcon } from "@/components/app/icon-map";
import { useFormatters } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { PROJECT_TYPE_META, projectTypeMeta } from "@/lib/projects/types";
import { compareLabels, type CompareRow } from "./compare";

export default function PortfolioCompare({
  rows,
  activeProjectId,
}: {
  rows: CompareRow[];
  activeProjectId?: string;
}) {
  const fmt = useFormatters();
  const { locale } = useLocale();
  const L = compareLabels(locale);
  const maxRevenue = Math.max(1, ...rows.map((r) => r.totals.revenue));

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-accent">
            {L.eyebrow}
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-navy-800">{L.title}</h3>
        </div>
        <p className="text-sm text-muted">{L.lead.replace("{n}", String(rows.length))}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-muted">
              <th className="px-5 py-2.5 font-semibold">{L.project}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{L.revenue}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{L.cost}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{L.conversions}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{L.roas}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{L.pno}</th>
              <th className="px-5 py-2.5 text-right font-semibold">{L.trend}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const meta = projectTypeMeta(r.type, locale);
              const share = r.totals.revenue / maxRevenue;
              const active = r.id === activeProjectId;
              return (
                <tr
                  key={r.id}
                  className={`border-t border-line align-middle transition-colors ${
                    active ? "bg-brand-50/50" : "hover:bg-canvas/60"
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
                        style={{ backgroundColor: r.accentColor }}
                      >
                        <ModuleIcon icon={PROJECT_TYPE_META[r.type].icon} width={18} height={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-semibold text-navy-800">
                          <span className="truncate">{r.name}</span>
                          {active && (
                            <span className="shrink-0 rounded-pill bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-800">
                              {L.here}
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {meta.label}
                          {r.domain ? ` · ${r.domain}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <span className="tnum font-semibold text-navy-800">
                      {fmt.fmtCZKCompact(r.totals.revenue)}
                    </span>
                    {/* subtle in-cell share bar so the biggest earner reads at a glance */}
                    <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-navy-50">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.max(4, share * 100)}%`, backgroundColor: r.accentColor }}
                      />
                    </span>
                  </td>
                  <td className="tnum px-3 py-3.5 text-right text-navy-700">
                    {fmt.fmtCZKCompact(r.totals.cost)}
                  </td>
                  <td className="tnum px-3 py-3.5 text-right text-navy-700">
                    {fmt.fmtInt(r.totals.conversions)}
                  </td>
                  <td className="tnum px-3 py-3.5 text-right font-medium text-navy-800">
                    {fmt.fmtMultiple(r.totals.roas)}
                  </td>
                  <td className="tnum px-3 py-3.5 text-right">
                    <span className={r.totals.pno <= 0.2 ? "text-positive" : "text-coral-600"}>
                      {fmt.fmtPct(r.totals.pno)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end">
                      <Sparkline
                        values={r.revenueSpark}
                        width={132}
                        height={34}
                        autoColor
                        formatValue={fmt.fmtCZKCompact}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
