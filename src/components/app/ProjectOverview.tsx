/** Project overview — the home of a project workspace. Headline KPIs adapt to the
 *  project type (KPI_PRESETS), and a quick-access grid links to the project's
 *  modules. KPI figures come from the shared performance dataset (the only data
 *  source in v1) but are relabelled/reformatted to fit the business type. Server
 *  component. */
import Link from "next/link";
import Sparkline from "@/components/charts/Sparkline";
import { Pill } from "@/components/ui";
import { ArrowRight, Bulb } from "@/components/icons";
import { ModuleIcon } from "@/components/app/icon-map";
import { performance } from "@/lib/data";
import { bucketize, totalsOf, type Totals } from "@/lib/metrics";
import { fmtCZKCompact, fmtDate, fmtInt, fmtMultiple, fmtPct } from "@/lib/format";
import {
  KPI_PRESETS,
  modulesFor,
  type KpiFormat,
  type KpiMetric,
} from "@/lib/projects/modules";
import { PROJECT_TYPE_META, type Project } from "@/lib/projects/types";

function kpiValue(t: Totals, metric: KpiMetric): number {
  switch (metric) {
    case "revenue":
      return t.revenue;
    case "roas":
      return t.roas;
    case "pno":
      return t.pno;
    case "conversions":
      return t.conversions;
    case "cost":
      return t.cost;
    case "visits":
      return t.visits;
    case "cpa":
      return t.conversions > 0 ? t.cost / t.conversions : 0;
    case "convRate":
      return t.cr;
  }
}

function fmtKpi(v: number, format: KpiFormat): string {
  switch (format) {
    case "czk":
      return fmtCZKCompact(v);
    case "multiple":
      return fmtMultiple(v);
    case "pct":
      return fmtPct(v);
    case "int":
      return fmtInt(v);
  }
}

export default function ProjectOverview({ project }: { project: Project }) {
  const meta = PROJECT_TYPE_META[project.type];
  const last30 = totalsOf(performance.daily.slice(-30));
  const monthlyRevenue = bucketize(performance.daily.slice(-365), "month").map((b) => b.revenue);
  const lastDate = performance.daily.at(-1)?.date;
  const kpis = KPI_PRESETS[project.type];

  // Quick access: every module except the overview itself and system (settings).
  const quick = modulesFor(project.type).filter((m) => m.key !== "" && m.section !== "system");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      {/* header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white"
            style={{ backgroundColor: project.accentColor }}
          >
            <ModuleIcon icon={meta.icon} width={24} height={24} />
          </span>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-navy-800 sm:text-[28px]">
              {project.name}
            </h2>
            <p className="text-sm text-muted">
              {meta.label}
              {project.domain ? ` · ${project.domain}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="brand">{meta.primaryGoal}</Pill>
          <Pill tone="neutral">Ilustrativní data</Pill>
        </div>
      </div>

      {/* type-specific guidance */}
      <div className="mt-6 flex items-start gap-3 rounded-card border border-line bg-canvas px-4 py-3.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-accent">
          <Bulb width={17} height={17} />
        </span>
        <p className="text-sm leading-relaxed text-muted">{meta.overviewLead}</p>
      </div>

      {/* KPI band */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{kpi.label}</p>
            <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
              {fmtKpi(kpiValue(last30, kpi.metric), kpi.format)}
            </p>
          </div>
        ))}
      </div>

      {/* trend strip */}
      <div className="mt-4 card flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">Obrat za posledních 30 dní</p>
          <p className="tnum mt-1 text-2xl font-semibold tracking-tight text-navy-800">
            {fmtCZKCompact(last30.revenue)}
          </p>
          {lastDate && (
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden />
              Data k <time dateTime={lastDate}>{fmtDate(lastDate)}</time>
            </p>
          )}
        </div>
        <Sparkline values={monthlyRevenue} width={220} height={56} autoColor dot describe formatValue={fmtCZKCompact} />
      </div>

      {/* quick access to modules */}
      <h3 className="mt-10 text-sm font-semibold uppercase tracking-[0.12em] text-muted">Moduly</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quick.map((m) => (
            <Link
              key={m.key}
              href={`/app/${project.id}/${m.key}`}
              className="card group flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:shadow-pop"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-accent transition-colors group-hover:bg-brand-600 group-hover:text-white">
                <ModuleIcon icon={m.icon} width={22} height={22} />
              </span>
              <h4 className="mt-4 text-base font-semibold text-navy-800">{m.label}</h4>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">{m.blurb}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-accent">
                Otevřít
                <ArrowRight width={15} height={15} className="transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
        ))}
      </div>
    </div>
  );
}
