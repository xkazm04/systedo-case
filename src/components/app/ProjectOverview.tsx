/** Project overview — the home of a workspace. With more than one project it is a
 *  cross-project PORTFOLIO view: a comparison of every project's headline factors
 *  plus a combined, cross-project "Needs attention" feed. With a single project it
 *  falls back to that project's own KPI band + trend. KPI figures come from the
 *  shared performance dataset (scaled + varied per project), relabelled per business
 *  type. Server component. */
import Sparkline from "@/components/charts/Sparkline";
import { Pill } from "@/components/ui";
import { Bulb } from "@/components/icons";
import { ModuleIcon } from "@/components/app/icon-map";
import PortfolioCompare from "@/components/app/overview/PortfolioCompare";
import LocationsOverviewSection from "@/components/app/overview/LocationsOverviewSection";
import NeedsAttention from "@/components/app/overview/NeedsAttention";
import { projectDataSource } from "@/lib/project-data/source";
import { hasSyncedMetrics } from "@/lib/report-metrics/store";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { collectRecommendations } from "@/lib/insights/aggregate";
import {
  getPortfolioModel,
  resolveChannelRecsInput,
  resolveLocalRecsInput,
  resolveSeoQueries,
  type PortfolioRec,
} from "@/components/app/overview/portfolio-model";
import { bucketize, totalsOf, type Totals } from "@/lib/metrics";
import type { Formatters } from "@/lib/format";
import {
  KPI_PRESETS,
  kpiLabel,
  kpiHint,
  type KpiFormat,
  type KpiMetric,
} from "@/lib/projects/modules";
import { projectTypeMeta, PROJECT_TYPE_META, type Project } from "@/lib/projects/types";
import { getAdviceLedger } from "@/lib/advice/store";
import { recordAdviceSighting } from "@/lib/advice/record";
import { isDemoProjectId } from "@/lib/projects/demo";
import { currentUserId } from "@/lib/session";
import { getServerFormatters, getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";

const T = {
  cs: {
    revenue30: "Obrat za posledních 30 dní",
    dataAsOf: "Data k",
    locations: "Pobočky",
    portfolioEyebrow: "Portfolio",
    portfolioTitle: "Přehled portfolia",
    portfolioLead: "Souhrn napříč {n} projekty · obrat {revenue} · ROAS {roas}",
  },
  en: {
    revenue30: "Revenue, last 30 days",
    dataAsOf: "Data as of",
    locations: "Locations",
    portfolioEyebrow: "Portfolio",
    portfolioTitle: "Portfolio overview",
    portfolioLead: "Across {n} projects · revenue {revenue} · ROAS {roas}",
  },
} as const;

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

/** A recommendation tagged with the project it belongs to (for the combined feed). */
type ProjRec = PortfolioRec;

/* The "Needs attention" feed (with its advice-ledger affordances) lives in
 * ./overview/NeedsAttention — extracted in WP W3-A.
 *
 * The local-signals / SEO-slate resolvers and the portfolio view-model live in
 * ./overview/portfolio-model — one owner for the computation, plus the demo
 * fast path (pure sample inputs + module-level memo) the public /dashboard uses. */

export default async function ProjectOverview({
  projects,
  activeProjectId,
  hrefForModule,
}: {
  /** Every project in the workspace. One → single-project view; more → portfolio. */
  projects: Project[];
  /** The route's active project (authed [projectId]); highlighted in the comparison. */
  activeProjectId?: string;
  /** Builds a module link for a project. Defaults to the authed `/app/{id}/{key}`
   *  route; the public demo overrides it to route within `/dashboard?m=`. */
  hrefForModule?: (projectId: string, moduleKey: string) => string;
}) {
  const fmt = await getServerFormatters();
  const t = await getT(T);
  const locale = await getServerLocale();

  const moduleHref =
    hrefForModule ??
    ((projectId: string, key: string) => (key ? `/app/${projectId}/${key}` : `/app/${projectId}`));

  /* ----------------------------------------------------------- single project */
  if (projects.length <= 1) {
    const project = projects[0]!;
    const data = getProjectDataset(project);
    // Honest label: "živá data" only once the project has SYNCED rows (not merely
    // linked an Ads account) — the same signal the Monthly Report/AI recap use. The
    // SAME boolean is threaded into the aggregator so the dataset-derived recs
    // (profit/seasonality) carry the same provenance the pill shows.
    // The channel plan resolves the way /kanaly does (pinned AI plan else the seed),
    // so the "Kanál zdarma" rec names a channel from the plan the tenant actually has.
    const [localInput, seoQueries, synced, channelPlan] = await Promise.all([
      resolveLocalRecsInput(project),
      resolveSeoQueries(project),
      hasSyncedMetrics(project.id),
      resolveChannelRecsInput(project),
    ]);
    const recs: ProjRec[] = collectRecommendations(
      project,
      locale,
      localInput,
      seoQueries,
      synced,
      channelPlan
    ).map((r) => ({
      ...r,
      projectId: project.id,
      projectName: project.name,
      projectAccent: project.accentColor,
    }));
    // WP W3-A. The read is awaited (the feed renders from it); the WRITE is not —
    // `recordAdviceSighting` catches everything internally and is a fire-and-forget
    // observation, so a slow or broken ledger can never delay or fail this page. The
    // read is one project_state round-trip and is skipped entirely for a demo id and
    // for an anonymous viewer, keeping the public /dashboard path I/O-free.
    const uid = isDemoProjectId(project.id) ? null : await currentUserId();
    const ledger = uid ? await getAdviceLedger(uid, project.id) : null;
    void recordAdviceSighting(project.id, recs);
    const meta = projectTypeMeta(project.type, locale);
    const typeIcon = PROJECT_TYPE_META[project.type].icon;
    const ds = projectDataSource(synced, locale);
    const last30 = totalsOf(data.daily.slice(-30));
    const monthlyRevenue = bucketize(data.daily.slice(-365), "month").map((b) => b.revenue);
    const lastDate = data.daily.at(-1)?.date;
    const kpis = KPI_PRESETS[project.type];

    return (
      <div className="stagger mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
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
          {kpis.map((kpi) => {
            const hint = kpiHint(kpi, locale);
            return (
            <div key={kpi.metric} className="card p-5">
              <p
                className={`text-xs font-medium uppercase tracking-wide text-muted${hint ? " cursor-help" : ""}`}
                title={hint || undefined}
              >
                {kpiLabel(kpi, locale)}
              </p>
              <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
                {fmtKpi(kpiValue(last30, kpi.metric), kpi.format, fmt)}
              </p>
            </div>
            );
          })}
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
          <Sparkline
            values={monthlyRevenue}
            width={220}
            height={56}
            autoColor
            dot
            describe
            formatValue={fmt.fmtCZKCompact}
          />
        </div>

        {/* locations roster — folded in for local projects (descoped Pobočky module) */}
        <LocationsOverviewSection project={project} heading={t("locations")} />

        <NeedsAttention
          recs={recs}
          count={recs.length}
          moduleHref={moduleHref}
          showProject={false}
          ledger={ledger}
        />
      </div>
    );
  }

  /* --------------------------------------------------------- portfolio (2+) */
  // One owner for the whole cross-project computation: rows (with the honest per-row
  // source signal), plus the combined impact-ranked rec feed. A workspace of demo
  // fixtures (the public /dashboard) is served from the module-level memo — the
  // deterministic model is computed once, with zero store round-trips; any real
  // tenant id in the list bypasses the memo and resolves its stores per request.
  const { rows, combined } = await getPortfolioModel(projects, locale);

  const totalRevenue = rows.reduce((s, r) => s + r.totals.revenue, 0);
  const totalCost = rows.reduce((s, r) => s + r.totals.cost, 0);
  const blendedRoas = totalCost > 0 ? totalRevenue / totalCost : 0;
  const topCombined = combined.slice(0, 8);

  return (
    <div className="stagger mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      {/* portfolio header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-accent">
          {t("portfolioEyebrow")}
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-navy-800 sm:text-[28px]">
          {t("portfolioTitle")}
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          {t("portfolioLead", {
            n: rows.length,
            revenue: fmt.fmtCZKCompact(totalRevenue),
            roas: fmt.fmtMultiple(blendedRoas),
          })}
        </p>
      </div>

      {/* cross-project comparison */}
      <div className="mt-6">
        <PortfolioCompare rows={rows} activeProjectId={activeProjectId} />
      </div>

      {/* active project's locations roster, when it is a local project — folds in
          the descoped Pobočky module so the overview stays the one home per type */}
      {activeProjectId && (
        <LocationsOverviewSection
          project={projects.find((p) => p.id === activeProjectId) ?? projects[0]!}
          heading={t("locations")}
        />
      )}

      {/* combined cross-project needs-attention. No ledger: it is per-project, and
          reading one per project on every portfolio render would cost N round-trips
          for a feed that is already truncated to eight rows. Sightings ARE recorded
          per project (portfolio-model), so the outcomes still land — they surface on
          each project's own overview. */}
      <NeedsAttention
        recs={topCombined}
        count={combined.length}
        moduleHref={moduleHref}
        showProject
      />
    </div>
  );
}
