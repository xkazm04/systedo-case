/** Sklad & sezónnost — seasonality index + stock-aware budget pacing. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import InventorySeasonModule from "@/components/app/modules/InventorySeasonModule";
import WarehouseSourceBar from "@/components/app/modules/WarehouseSourceBar";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { loadProductsFor } from "@/lib/catalog/load";
import { warehouseConnectionFor } from "@/lib/inventory/warehouse";
import { budgetChangeSet, monthlySeasonality, seasonalBudgetPlan, stockRows } from "@/lib/inventory/compute";


/** Notional baseline monthly ad budget (CZK) the seasonal plan scales. */
const BASELINE_MONTHLY_BUDGET = 120_000;

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "sklad-sezonnost");
  const data = getProjectDataset(project);

  const season = monthlySeasonality(data.daily);
  const lastDate = data.daily.at(-1)?.date;
  // Reference "now" derived server-side from the dataset's last day, so the
  // projected stockout dates are deterministic (no Date.now() in the client render).
  const now = lastDate ? new Date(`${lastDate}T00:00:00Z`) : new Date();
  const currentMonth = now.getUTCMonth();

  // Products come from the project catalog (the business source of truth); the
  // warehouse connection is the source badge shown by WarehouseSourceBar.
  const connection = warehouseConnectionFor(project.id, now);
  const products = await loadProductsFor(project, now);

  const stock = stockRows(products, now);

  // Aggregate days-of-cover (median of finite covers) caps upcoming budget months.
  const covers = stock.map((s) => s.daysOfCover).filter((d) => Number.isFinite(d)).sort((a, b) => a - b);
  const aggregateDaysOfCover = covers.length > 0 ? covers[Math.floor(covers.length / 2)]! : Infinity;

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
