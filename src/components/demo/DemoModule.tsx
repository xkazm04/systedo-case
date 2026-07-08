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
import CatalogManagerModule from "@/components/app/modules/CatalogManagerModule";
import LtvModule from "@/components/app/modules/LtvModule";
import LpExperimentsModule from "@/components/app/modules/LpExperimentsModule";
import CompareSeoModule from "@/components/app/modules/CompareSeoModule";
import LeadQualityModule from "@/components/app/modules/LeadQualityModule";
import SpeedLeadModule from "@/components/app/modules/SpeedLeadModule";
import LocalModule from "@/components/app/modules/LocalModule";
import MapPackModule from "@/components/app/modules/MapPackModule";
import ReviewInbox from "@/components/app/modules/ReviewInbox";
import ContentSchedule from "@/components/app/modules/ContentSchedule";
import BrandingModule from "@/components/app/modules/BrandingModule";
import MonthlyReport from "@/components/app/modules/MonthlyReport";
import ActivityModule from "@/components/app/modules/ActivityModule";
import ContentEngine from "@/components/app/modules/ContentEngine";
import DistributionModule from "@/components/app/modules/DistributionModule";
import AudienceModule from "@/components/app/modules/AudienceModule";
import ProjectSettings from "@/components/app/modules/ProjectSettings";
import SpendModule from "@/components/app/modules/SpendModule";
import IntegrationStatusModule from "@/components/app/modules/IntegrationStatusModule";
import AccountSecurity from "@/components/app/modules/AccountSecurity";
import { spendForProject } from "@/lib/spend/sample";
import { computeIntegrationRows } from "@/lib/integrations/compute";

import { getProjectDataset } from "@/lib/project-data/dataset";
import { getT } from "@/lib/i18n/server";
import { channelRows, totalsOf } from "@/lib/metrics";
import { defaultMargins, SAMPLE_PRODUCTS as PROFIT_PRODUCTS } from "@/lib/profit/sample";
import { categoryMixFromCatalog } from "@/lib/profit/products";
import { profitTrend } from "@/lib/profit/trend";
import type { ProfitTrendPoint, TrendGranularity } from "@/lib/profit/types";
import { SAMPLE_PRODUCTS as CATALOG_PRODUCTS } from "@/lib/catalog/sample";
import { getProjectCatalog, localitiesFor, plansFor, productsFor, servicesFor } from "@/lib/catalog/resolve";
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
import { comparisonQueriesFromCatalog } from "@/lib/seo-compare/catalog";
import { sourcesForProject } from "@/lib/lead-quality/sample";
import { SAMPLE_LEADS } from "@/lib/speed-lead/sample";
import { SAMPLE_RECENT_REVIEWS, reviewsForProject, targetsForProject } from "@/lib/local/sample";
import { targetsFromCatalog } from "@/lib/local/catalog";
import { keywordLadder, packsForProject } from "@/lib/mappack/sample";
import { reviewsForProject as inboxReviewsForProject } from "@/lib/reviews/sample";
import { initialPosts } from "@/lib/content-schedule/sample";
import { activityForProject } from "@/lib/activity/sample";
import { buildSnapshot } from "@/lib/snapshot";
import { ANALYSIS_PERIODS, type AnalysisPeriod } from "@/lib/ai-types";
import { reportTilesForType, type ReportSnap } from "@/lib/report/compute";
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

/** No-op for the public demo's Account surface — there's no real session to end,
 *  so sign-out / revoke do nothing here (the buttons are shown for the tour). */
async function demoAccountAction() {
  "use server";
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
      const generated = comparisonQueriesFromCatalog(project.name, plansFor(project));
      const queries = generated.length > 0 ? generated : SAMPLE_QUERIES;
      return (
        <ModulePage moduleKey="srovnani-seo">
          {noted(<CompareSeoModule queries={queries} seoChannel={seoChannel} />)}
        </ModulePage>
      );
    }
    case "lokalni": {
      const services = servicesFor(project);
      const targets =
        services.length > 0 ? targetsFromCatalog(services, localitiesFor(project)) : targetsForProject(project);
      return (
        <ModulePage moduleKey="lokalni">
          {noted(
            <LocalModule
              targets={targets}
              reviews={reviewsForProject(project)}
              recentReviews={SAMPLE_RECENT_REVIEWS}
              businessName={project.name}
            />
          )}
        </ModulePage>
      );
    }
    case "mapa": {
      // Mirrors the authed /mapa page, minus the live-ladder seam + import control
      // (projectId omitted, so LocalLadderSource stays hidden): the competitor map
      // pack + keyword ladder run on the project's localities × service catalog.
      const localities = localitiesFor(project);
      const services = servicesFor(project);
      return (
        <ModulePage moduleKey="mapa">
          {noted(
            <MapPackModule
              packs={packsForProject(project, localities, project.name)}
              ladder={keywordLadder(project, localities, services)}
            />
          )}
        </ModulePage>
      );
    }

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
    case "recenze": {
      const localities = localitiesFor(project);
      const services = servicesFor(project);
      return (
        <ModulePage moduleKey="recenze">
          {noted(
            <ReviewInbox
              reviews={inboxReviewsForProject(project, localities)}
              areas={localities.map((l) => l.name)}
              businessName={project.name}
              businessType={services[0]?.category}
              projectId={project.id}
            />
          )}
        </ModulePage>
      );
    }
    case "obsah-plan":
      return (
        <ModulePage moduleKey="obsah-plan">
          {noted(
            <ContentSchedule
              posts={initialPosts(project, servicesFor(project), localitiesFor(project))}
              projectId={project.id}
            />
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
      const catalogMix = categoryMixFromCatalog(productsFor(project));
      const products = catalogMix.length > 0 ? catalogMix : PROFIT_PRODUCTS;
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
              products={products}
              defaults={margins}
            />
          )}
        </ModulePage>
      );
    }
    case "katalog": {
      const data = getProjectDataset(project);
      const lastDate = data.daily.at(-1)?.date;
      const now = new Date(`${lastDate ?? "2026-01-01"}T00:00:00Z`);
      const offerings = getProjectCatalog(project, now);
      const connection =
        project.type === "eshop" && warehouse !== "off" ? warehouseConnectionFor(project.id, now) : null;
      return (
        <ModulePage moduleKey="katalog">
          {noted(
            <CatalogManagerModule
              offerings={offerings}
              connection={connection}
              localities={localitiesFor(project)}
              projectType={project.type}
              projectName={project.name}
              projectId={project.id}
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
    case "spotreba":
      return (
        <ModulePage moduleKey="spotreba">
          {noted(<SpendModule entries={spendForProject(project)} isLive={false} />)}
        </ModulePage>
      );
    case "integrace":
      // A representative "mostly connected" readiness board, so a prospect sees
      // what a live deployment looks like (real env probing is per-tenant + authed).
      return (
        <ModulePage moduleKey="integrace">
          {noted(
            <IntegrationStatusModule
              rows={computeIntegrationRows({
                googleAdsToken: true, googleAdsCustomer: true, googleOAuth: true,
                gemini: true, resend: true, cron: true,
                firestore: true, localDb: false, devAuth: false,
                lighttrack: false, social: false, leonardo: true,
                adsLinked: true, byomValidated: false, warehouse: false,
              })}
            />
          )}
        </ModulePage>
      );
    case "ucet":
      return (
        <ModulePage moduleKey="ucet">
          {noted(
            <AccountSecurity
              user={{ id: "demo-user", name: "Ukázkový uživatel", email: "demo@adamant.app", image: null }}
              facts={{ hasEmail: true, oauth: true, devMode: false }}
              expiresDate={null}
              sessionCount={2}
              signOutAction={demoAccountAction}
              signOutEverywhereAction={demoAccountAction}
            />
          )}
        </ModulePage>
      );

    case "branding":
      // Live brand-accent + logo preview. Persistence targets an authed route, so
      // saving is a no-op in the public demo — the preview itself is the point.
      return (
        <ModulePage moduleKey="branding">
          <BrandingModule
            projectId={project.id}
            name={project.name}
            accentColor={project.accentColor}
            logoUrl={project.logoUrl}
          />
        </ModulePage>
      );
    case "mesicni-report": {
      // Mirrors the authed report minus the e-shop-only extras (cost model,
      // competitors, LTV/stock spine) and the live-sync seam: type-aware KPI tiles
      // over this project's dataset. projectId omitted → the sync control is hidden.
      const dataset = getProjectDataset(project);
      const snaps = {} as Record<AnalysisPeriod, ReportSnap>;
      for (const p of ANALYSIS_PERIODS) {
        const s = buildSnapshot(p, "previous", dataset);
        const c = s.current;
        const cpa = c.conversions > 0 ? c.cost / c.conversions : 0;
        const prevConv = c.conversions / (1 + (s.delta.conversions ?? 0));
        const prevCost = c.cost / (1 + (s.delta.cost ?? 0));
        const prevCpa = prevConv > 0 ? prevCost / prevConv : 0;
        snaps[p] = {
          label: s.periodLabel,
          current: {
            revenue: c.revenue, roas: c.roas, pno: c.pno, conversions: c.conversions,
            cost: c.cost, visits: c.visits, cpa, convRate: c.cr, profit: c.profit,
            poas: c.cost > 0 ? c.profit / c.cost : 0,
          },
          delta: {
            revenue: s.delta.revenue, pno: s.delta.pno, conversions: s.delta.conversions,
            cost: s.delta.cost, visits: s.delta.visits, convRate: s.delta.cr,
            cpa: prevCpa > 0 ? cpa / prevCpa - 1 : 0, profit: s.delta.profit,
          },
        };
      }
      return (
        <ModulePage moduleKey="mesicni-report">
          {noted(
            <MonthlyReport
              tiles={reportTilesForType(project.type)}
              snaps={snaps}
              projectName={project.name}
              logoUrl={project.logoUrl}
              accentColor={project.accentColor}
            />
          )}
        </ModulePage>
      );
    }
    case "aktivita":
      return (
        <ModulePage moduleKey="aktivita">
          {noted(<ActivityModule events={activityForProject(project, localitiesFor(project))} />)}
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
