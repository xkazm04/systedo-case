/** Sklad & sezónnost — seasonality index + stock-aware budget pacing. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import InventorySeasonModule from "@/components/app/modules/InventorySeasonModule";
import WarehouseSourceBar from "@/components/app/modules/WarehouseSourceBar";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { resolveReportDataset } from "@/lib/report-metrics/resolve";
import { loadProductsFor } from "@/lib/catalog/load";
import { currentUserId } from "@/lib/session";
import { deriveWarehouseBadge, warehouseConnectionFor } from "@/lib/inventory/warehouse";
import { getConnection } from "@/lib/inventory/connection-store";
import { getStoredPlan } from "@/lib/inventory/plan-store";
import { budgetChangeSet, monthlySeasonality, seasonalBudgetPlan, stockRows } from "@/lib/inventory/compute";
import { isDemoProject } from "@/lib/projects/demo";


/** Notional baseline monthly ad budget (CZK) the seasonal plan scales — the honest
 *  FLOOR used only when a project has no real spend to ground it (demo / unsynced).
 *  A live-synced project derives the baseline from its own trailing-30d ad spend. */
const BASELINE_MONTHLY_BUDGET = 120_000;

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project } = await requireProjectModule(projectId, "sklad-sezonnost");
  const data = getProjectDataset(project);

  const season = monthlySeasonality(data.daily);
  const lastDate = data.daily.at(-1)?.date;
  // Reference "now" derived server-side from the dataset's last day, so the
  // projected stockout dates are deterministic (no Date.now() in the client render).
  const now = lastDate ? new Date(`${lastDate}T00:00:00Z`) : new Date();
  const currentMonth = now.getUTCMonth();

  // Products come from the project catalog (the business source of truth); the
  // warehouse connection is the source badge shown by WarehouseSourceBar. Demo
  // projects show the illustrative (honestly-labeled) badge; a real project's badge
  // is derived from its persisted StoredConnection so it reflects the truth — provider,
  // last-sync age and sync health — even after a real connect + sync.
  const connection = isDemoProject(project)
    ? warehouseConnectionFor(project.id, now)
    : deriveWarehouseBadge(await resolveStoredConnection(project.id), now);
  const products = await loadProductsFor(project, now);

  const stock = stockRows(products, now);

  // Aggregate days-of-cover (median of finite covers) caps upcoming budget months.
  const covers = stock.map((s) => s.daysOfCover).filter((d) => Number.isFinite(d)).sort((a, b) => a - b);
  const aggregateDaysOfCover = covers.length > 0 ? covers[Math.floor(covers.length / 2)]! : Infinity;

  // Ground the seasonal budget plan in REAL money when the project has a live Ads sync
  // (trailing-30d spend from the same resolveReportDataset seam mesicni-report uses),
  // falling back to the notional 120k baseline only when there's nothing real to scale.
  // The plan is illustrative exactly when it rests on that notional baseline — pass that
  // one boolean to ModulePage's `sample` gutter so the CZK recommendations next to real
  // warehouse data are never rendered unlabeled off a fictitious baseline.
  const resolved = await resolveReportDataset(project);
  const trailingSpend = resolved.live
    ? Math.round(resolved.data.daily.slice(-30).reduce((sum, d) => sum + d.cost, 0))
    : 0;
  const budgetIsIllustrative = trailingSpend <= 0;
  const baselineBudget = budgetIsIllustrative ? BASELINE_MONTHLY_BUDGET : trailingSpend;

  const budgetPlan = seasonalBudgetPlan(baselineBudget, season, {
    daysOfCover: aggregateDaysOfCover,
    currentMonth,
  });
  const changeSet = budgetChangeSet(stock);

  // Direction 1: the saved action plan (per-move accept/dismiss) for real projects.
  // Demo projects aren't owned/persisted, so their accept/dismiss stays local-only —
  // pass no projectId (and no stored plan) to keep the module honest about that.
  const isDemo = isDemoProject(project);
  const storedPlan = isDemo ? null : await getStoredPlan(project.id);

  return (
    <ModulePage moduleKey="sklad-sezonnost" sample={budgetIsIllustrative}>
      <div className="mb-5">
        <WarehouseSourceBar connection={connection} skuCount={products.length} />
      </div>
      <InventorySeasonModule
        season={season}
        currentMonth={currentMonth}
        stock={stock}
        budgetPlan={budgetPlan}
        changeSet={changeSet}
        projectId={isDemo ? undefined : project.id}
        storedPlan={storedPlan}
      />
    </ModulePage>
  );
}

/** The signed-in user's stored warehouse connection for this project, or null. The
 *  session read is request-deduped (React cache) with the guard's, so this reuses it. */
async function resolveStoredConnection(projectId: string) {
  const userId = await currentUserId();
  if (!userId) return null;
  return getConnection(userId, projectId);
}
