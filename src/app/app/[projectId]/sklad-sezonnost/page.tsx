/** Sklad & sezónnost — seasonality index + stock-aware budget pacing. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import InventorySeasonModule from "@/components/app/modules/InventorySeasonModule";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { SAMPLE_PRODUCTS } from "@/lib/catalog/sample";
import { monthlySeasonality, stockRows } from "@/lib/inventory/compute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  return (
    <ModulePage moduleKey="sklad-sezonnost">
      <InventorySeasonModule season={season} currentMonth={currentMonth} stock={stockRows(SAMPLE_PRODUCTS, now)} />
    </ModulePage>
  );
}
