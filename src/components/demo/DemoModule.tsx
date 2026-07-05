/** Server-side module dispatcher for the public /dashboard demo. Mirrors each
 *  authed module page's data-prep (the same pure sample libs) but feeds a mock
 *  demo project instead of resolving one behind auth — so every module renders
 *  publicly with coherent illustrative data. Kept in one file so the 22 real
 *  module pages under /app/[projectId]/* stay untouched.
 *
 *  The API/LLM-backed modules (campaigns, social, creative, patterns, reports)
 *  are propless clients that self-fetch: on the deployed app they return the
 *  anonymous "sample" tenant; locally without a backend they show their own clean
 *  empty/demo state. Everything else renders fully from static sample data. */
import ModulePage from "@/components/app/ModulePage";
import SampleDataNote from "@/components/app/SampleDataNote";
import ProjectOverview from "@/components/app/ProjectOverview";
import DashboardClient from "@/components/dashboard/DashboardClient";
import CampaignsClient from "@/components/campaigns/CampaignsClient";
import KeywordsModule from "@/components/app/modules/KeywordsModule";
import SocialClient from "@/components/social/SocialClient";
import CreativeStudio from "@/components/ai/CreativeStudio";
import PatternsLibrary from "@/components/patterns/PatternsLibrary";
import SharedReportsList from "@/components/campaigns/SharedReportsList";
import ProfitModule from "@/components/app/modules/ProfitModule";
import CatalogModule from "@/components/app/modules/CatalogModule";
import InventorySeasonModule from "@/components/app/modules/InventorySeasonModule";
import WarehouseSourceBar from "@/components/app/modules/WarehouseSourceBar";
import LtvModule from "@/components/app/modules/LtvModule";
import LpExperimentsModule from "@/components/app/modules/LpExperimentsModule";
import CompareSeoModule from "@/components/app/modules/CompareSeoModule";
import LeadQualityModule from "@/components/app/modules/LeadQualityModule";
import SpeedLeadModule from "@/components/app/modules/SpeedLeadModule";
import LocalModule from "@/components/app/modules/LocalModule";
import ContentEngine from "@/components/app/modules/ContentEngine";
import DistributionModule from "@/components/app/modules/DistributionModule";
import AudienceModule from "@/components/app/modules/AudienceModule";
import ProjectSettings from "@/components/app/modules/ProjectSettings";

import { getProjectDataset } from "@/lib/project-data/dataset";
import { getT } from "@/lib/i18n/server";
import { channelRows, totalsOf } from "@/lib/metrics";
import { defaultMargins, SAMPLE_PRODUCTS as PROFIT_PRODUCTS } from "@/lib/profit/sample";
import { profitTrend } from "@/lib/profit/trend";
import type { ProfitTrendPoint, TrendGranularity } from "@/lib/profit/types";
import { SAMPLE_PRODUCTS as CATALOG_PRODUCTS } from "@/lib/catalog/sample";
import { productsFor } from "@/lib/catalog/resolve";
import {
  budgetChangeSet,
  monthlySeasonality,
  seasonalBudgetPlan,
  stockRows,
} from "@/lib/inventory/compute";
import { warehouseConnectionFor } from "@/lib/inventory/warehouse";
import { ESHOP_COHORTS, SAMPLE_COHORTS } from "@/lib/ltv/sample";
import { ltvSummary, withMetrics } from "@/lib/ltv/compute";
import { experimentsForProject } from "@/lib/lp-exp/sample";
import { SAMPLE_QUERIES } from "@/lib/seo-compare/sample";
import { seoChannelFrom } from "@/lib/seo-compare/compute";
import { sourcesForProject } from "@/lib/lead-quality/sample";
import { SAMPLE_LEADS } from "@/lib/speed-lead/sample";
import { SAMPLE_RECENT_REVIEWS, reviewsForProject, targetsForProject } from "@/lib/local/sample";
import { clustersForProject, SAMPLE_DECAY } from "@/lib/content-engine/sample";
import { attributionForProject, SAMPLE_SOURCE } from "@/lib/distribution/sample";
import { audienceForProject } from "@/lib/audience/sample";
import { PROJECT_TYPE_META, type Project } from "@/lib/projects/types";
import { DEMO_PROJECTS, demoHref } from "@/lib/demo/projects";

/** Profit / inventory period windows (mirrors the authed zisk + sklad pages). */
const PERIOD_DAYS: Record<string, number> = { "30": 30, "90": 90, "365": 365 };
const TREND_GRANULARITY: Record<string, TrendGranularity> = {
  "30": "week",
  "90": "week",
  "365": "month",
};
/** Notional baseline monthly ad budget (CZK) the seasonal plan scales. */
const BASELINE_MONTHLY_BUDGET = 120_000;

const KAMPANE_T = {
  cs: {
    desc: "Google Ads kampaně, triáž, AI vyhodnocení a přesuny rozpočtu. Zaměření pro tento typ projektu: {focus}.",
  },
  en: {
    desc: "Google Ads campaigns, triage, AI evaluation and budget shifts. Focus for this project type: {focus}.",
  },
} as const;
const REPORTY_T = {
  cs: {
    desc: "Sdílené reporty pro klienty — vytvoříte je v modulu Kampaně tlačítkem „Sdílet report“. Zde je spravujete: počet zobrazení a zneplatnění odkazu.",
  },
  en: {
    desc: "Shared reports for clients — create them in the Campaigns module using the “Share report” button. Manage them here: view count and link invalidation.",
  },
} as const;

/** The illustrative-data banner most static modules carry, in the page gutter. */
function noted(children: React.ReactNode) {
  return (
    <>
      <div className="mb-5">
        <SampleDataNote />
      </div>
      {children}
    </>
  );
}

export default async function DemoModule({
  moduleKey,
  project,
  warehouse,
}: {
  moduleKey: string;
  project: Project;
  /** Direction 2 demo toggle: `off` shows the connector picker instead of the
   *  connected warehouse-grade view. Defaults to connected. */
  warehouse?: "on" | "off";
}) {
  switch (moduleKey) {
    /* -------------------------------------------------------------- Overview */
    case "vykon":
      return (
        <ModulePage moduleKey="vykon">
          <DashboardClient data={getProjectDataset(project)} reportHref="/dashboard/report" />
        </ModulePage>
      );

    /* ------------------------------------------------------------ Acquisition */
    case "kampane": {
      const focus = PROJECT_TYPE_META[project.type].channelFocus;
      const t = await getT(KAMPANE_T);
      return (
        <ModulePage moduleKey="kampane" description={focus ? t("desc", { focus }) : undefined}>
          <CampaignsClient />
        </ModulePage>
      );
    }
    case "klicova-slova":
      return (
        <ModulePage moduleKey="klicova-slova">
          <KeywordsModule />
        </ModulePage>
      );
    case "sklad-sezonnost": {
      const data = getProjectDataset(project);
      const season = monthlySeasonality(data.daily);
      const lastDate = data.daily.at(-1)?.date;
      // Reference "now" derived from the dataset's last day (deterministic).
      const now = new Date(`${lastDate ?? "2026-01-01"}T00:00:00Z`);
      const currentMonth = now.getUTCMonth();

      // Products come from the project catalog; `?wh=off` toggles the source badge
      // (connected → Baselinker) shown by WarehouseSourceBar.
      const connection = warehouse === "off" ? null : warehouseConnectionFor(project.id, now);
      const products = productsFor(project, now);

      const stock = stockRows(products, now);
      const covers = stock
        .map((s) => s.daysOfCover)
        .filter((d) => Number.isFinite(d))
        .sort((a, b) => a - b);
      const aggregateDaysOfCover =
        covers.length > 0 ? covers[Math.floor(covers.length / 2)]! : Infinity;
      const budgetPlan = seasonalBudgetPlan(BASELINE_MONTHLY_BUDGET, season, {
        daysOfCover: aggregateDaysOfCover,
        currentMonth,
      });
      const changeSet = budgetChangeSet(stock);
      return (
        <ModulePage moduleKey="sklad-sezonnost">
          <div className="mb-5">
            <WarehouseSourceBar connection={connection} skuCount={products.length} />
          </div>
          <InventorySeasonModule
            season={season}
            currentMonth={currentMonth}
            stock={stock}
            budgetPlan={budgetPlan}
            changeSet={changeSet}
          />
        </ModulePage>
      );
    }
    case "srovnani-seo": {
      const data = getProjectDataset(project);
      const rows = channelRows(data.channels, totalsOf(data.daily.slice(-90)));
      const seoChannel = seoChannelFrom(rows);
      return (
        <ModulePage moduleKey="srovnani-seo">
          {noted(<CompareSeoModule queries={SAMPLE_QUERIES} seoChannel={seoChannel} />)}
        </ModulePage>
      );
    }
    case "lokalni":
      return (
        <ModulePage moduleKey="lokalni">
          {noted(
            <LocalModule
              targets={targetsForProject(project)}
              reviews={reviewsForProject(project)}
              recentReviews={SAMPLE_RECENT_REVIEWS}
              businessName={project.name}
            />
          )}
        </ModulePage>
      );
    /* ----------------------------------------------------------------- Studio */
    case "obsahovy-engine":
      return (
        <ModulePage moduleKey="obsahovy-engine">
          <ContentEngine clusters={clustersForProject(project)} decay={SAMPLE_DECAY} />
        </ModulePage>
      );
    case "socialni":
      return (
        <ModulePage moduleKey="socialni">
          <SocialClient />
        </ModulePage>
      );
    case "kreativa":
      return (
        <ModulePage moduleKey="kreativa">
          <CreativeStudio />
        </ModulePage>
      );
    case "produktova-kreativa":
      return (
        <ModulePage moduleKey="produktova-kreativa">
          {noted(<CatalogModule products={CATALOG_PRODUCTS} />)}
        </ModulePage>
      );
    case "experimenty-lp":
      return (
        <ModulePage moduleKey="experimenty-lp">
          {noted(<LpExperimentsModule experiments={experimentsForProject(project)} />)}
        </ModulePage>
      );
    case "rychla-reakce":
      return (
        <ModulePage moduleKey="rychla-reakce">
          {noted(<SpeedLeadModule leads={SAMPLE_LEADS} />)}
        </ModulePage>
      );
    case "distribuce":
      return (
        <ModulePage moduleKey="distribuce">
          {noted(
            <DistributionModule source={SAMPLE_SOURCE} attribution={attributionForProject(project)} />
          )}
        </ModulePage>
      );

    /* --------------------------------------------------------------- Insights */
    case "knihovna":
      return (
        <ModulePage moduleKey="knihovna">
          <PatternsLibrary />
        </ModulePage>
      );
    case "reporty": {
      const t = await getT(REPORTY_T);
      return (
        <ModulePage moduleKey="reporty" description={t("desc")}>
          <SharedReportsList refreshSignal={0} />
        </ModulePage>
      );
    }
    case "zisk": {
      const data = getProjectDataset(project);
      const margins = defaultMargins(data.channels);
      const anchorIso =
        data.daily.length > 0 ? data.daily[data.daily.length - 1]!.date : undefined;
      const rowsByPeriod = Object.fromEntries(
        Object.entries(PERIOD_DAYS).map(([key, days]) => [
          key,
          channelRows(data.channels, totalsOf(data.daily.slice(-days))),
        ])
      );
      const trendByPeriod = Object.fromEntries(
        Object.entries(PERIOD_DAYS).map(([key, days]) => [
          key,
          profitTrend(
            data.daily.slice(-days),
            data.channels,
            margins,
            TREND_GRANULARITY[key] ?? "week",
            anchorIso
          ),
        ])
      ) as Record<string, ProfitTrendPoint[]>;
      return (
        <ModulePage moduleKey="zisk">
          {noted(
            <ProfitModule
              projectId={project.id}
              rowsByPeriod={rowsByPeriod}
              trendByPeriod={trendByPeriod}
              channels={data.channels}
              products={PROFIT_PRODUCTS}
              defaults={margins}
            />
          )}
        </ModulePage>
      );
    }
    case "ltv": {
      const eshop = project.type === "eshop";
      const cohorts = eshop ? ESHOP_COHORTS : SAMPLE_COHORTS;
      return (
        <ModulePage moduleKey="ltv">
          {noted(
            <LtvModule
              rows={cohorts.map((c) => withMetrics(c))}
              summary={ltvSummary(cohorts)}
              cohorts={cohorts}
              eshop={eshop}
            />
          )}
        </ModulePage>
      );
    }
    case "kvalita-leadu":
      return (
        <ModulePage moduleKey="kvalita-leadu">
          {noted(<LeadQualityModule sources={sourcesForProject(project)} />)}
        </ModulePage>
      );
    case "publikum": {
      const audience = audienceForProject(project);
      return (
        <ModulePage moduleKey="publikum">
          {noted(
            <AudienceModule
              funnel={audience.funnel}
              segments={audience.segments}
              revenue={audience.revenue}
              subscriberSources={audience.subscriberSources}
              subscriberHistory={audience.subscriberHistory}
              rpmHistory={audience.rpmHistory}
              goals={audience.goals}
            />
          )}
        </ModulePage>
      );
    }

    /* ----------------------------------------------------------------- System */
    case "nastaveni":
      return (
        <ModulePage moduleKey="nastaveni">
          <ProjectSettings />
        </ModulePage>
      );

    /* ------------------------------- Portfolio overview (default / home) */
    default:
      // The demo is a single /dashboard route, so module links ignore the
      // project and route within the demo; the comparison shows every demo
      // project (no single "active" one to highlight).
      return (
        <ProjectOverview
          projects={DEMO_PROJECTS}
          hrefForModule={(_projectId, key) => demoHref(key)}
        />
      );
  }
}
