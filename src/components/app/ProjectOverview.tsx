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
import type { PerformanceData } from "@/lib/types";
import { projectDataSource } from "@/lib/project-data/source";
import { bucketize, totalsOf, type Totals } from "@/lib/metrics";
import type { Formatters } from "@/lib/format";
import {
  KPI_PRESETS,
  modulesFor,
  moduleLabel,
  moduleBlurb,
  kpiLabel,
  type KpiFormat,
  type KpiMetric,
} from "@/lib/projects/modules";
import { projectTypeMeta, PROJECT_TYPE_META, type Project } from "@/lib/projects/types";
import type { Recommendation, Severity } from "@/lib/insights/types";
import { getServerFormatters, getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";

const T = {
  cs: {
    revenue30: "Obrat za posledních 30 dní",
    dataAsOf: "Data k",
    needsAttention: "Vyžaduje pozornost",
    allGood: "Vše vypadá v pořádku — žádná upozornění napříč moduly.",
    priority: "Priorita",
    modules: "Moduly",
    open: "Otevřít",
  },
  en: {
    revenue30: "Revenue — last 30 days",
    dataAsOf: "Data as of",
    needsAttention: "Needs attention",
    allGood: "Everything looks good — no alerts across modules.",
    priority: "Priority",
    modules: "Modules",
    open: "Open",
  },
} as const;

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-negative",
  warning: "bg-coral-500",
  opportunity: "bg-positive",
  info: "bg-navy-300",
};

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

function fmtKpi(v: number, format: KpiFormat, fmt: Formatters): string {
  switch (format) {
    case "czk":
      return fmt.fmtCZKCompact(v);
    case "multiple":
      return fmt.fmtMultiple(v);
    case "pct":
      return fmt.fmtPct(v);
    case "int":
      return fmt.fmtInt(v);
  }
}

export default async function ProjectOverview({
  project,
  data,
  recommendations,
}: {
  project: Project;
  data: PerformanceData;
  recommendations: Recommendation[];
}) {
  const fmt = await getServerFormatters();
  const t = await getT(T);
  const locale = await getServerLocale();

  const meta = projectTypeMeta(project.type, locale);
  const typeIcon = PROJECT_TYPE_META[project.type].icon;
  const ds = projectDataSource(project);
  const last30 = totalsOf(data.daily.slice(-30));
  const monthlyRevenue = bucketize(data.daily.slice(-365), "month").map((b) => b.revenue);
  const lastDate = data.daily.at(-1)?.date;
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
            <ModuleIcon icon={typeIcon} width={24} height={24} />
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
          <Pill tone={ds.live ? "positive" : "neutral"}>{ds.label}</Pill>
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
          <div key={kpi.metric} className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{kpiLabel(kpi, locale)}</p>
            <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
              {fmtKpi(kpiValue(last30, kpi.metric), kpi.format, fmt)}
            </p>
          </div>
        ))}
      </div>

      {/* trend strip */}
      <div className="mt-4 card flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">{t("revenue30")}</p>
          <p className="tnum mt-1 text-2xl font-semibold tracking-tight text-navy-800">
            {fmt.fmtCZKCompact(last30.revenue)}
          </p>
          {lastDate && (
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden />
              {t("dataAsOf")} <time dateTime={lastDate}>{fmt.fmtDate(lastDate)}</time>
            </p>
          )}
        </div>
        <Sparkline values={monthlyRevenue} width={220} height={56} autoColor dot describe formatValue={fmt.fmtCZKCompact} />
      </div>

      {/* needs attention — cross-module command center */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">{t("needsAttention")}</h3>
          {recommendations.length > 0 && <Pill tone="neutral">{recommendations.length}</Pill>}
        </div>
        {recommendations.length === 0 ? (
          <div className="mt-3 flex items-center gap-3 rounded-card border border-line bg-canvas px-4 py-4 text-sm text-muted">
            <span className="h-2 w-2 rounded-full bg-positive" aria-hidden />
            {t("allGood")}
          </div>
        ) : (
          <div className="mt-3 card divide-y divide-line overflow-hidden">
            {recommendations.map((r, i) => (
              <Link
                key={r.id}
                href={`/app/${project.id}/${r.module}`}
                className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-navy-50"
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[r.severity]}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      {i < 3 && (
                        <span className="shrink-0 rounded-pill bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-accent">
                          {t("priority")} {i + 1}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-navy-800">{r.title}</span>
                    </span>
                    {r.metric && <span className="tnum shrink-0 text-xs font-medium text-muted">{r.metric}</span>}
                  </span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-muted">{r.detail}</span>
                  <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-accent">
                    {r.moduleLabel}
                    <ArrowRight width={13} height={13} />
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* quick access to modules */}
      <h3 className="mt-10 text-sm font-semibold uppercase tracking-[0.12em] text-muted">{t("modules")}</h3>
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
              <h4 className="mt-4 text-base font-semibold text-navy-800">{moduleLabel(m, locale)}</h4>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">{moduleBlurb(m, locale)}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-accent">
                {t("open")}
                <ArrowRight width={15} height={15} className="transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
        ))}
      </div>
    </div>
  );
}
