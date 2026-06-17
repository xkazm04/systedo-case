/** Zisk (POAS) — margin-aware profit view over the channel mix. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import ProfitModule from "@/components/app/modules/ProfitModule";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { channelRows, totalsOf } from "@/lib/metrics";
import { defaultMargins } from "@/lib/profit/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERIOD_DAYS: Record<string, number> = { "30": 30, "90": 90, "365": 365 };

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "zisk");
  const data = getProjectDataset(project);

  // Precompute the channel mix per period on the server; the client only re-applies
  // the (live-editable) margin model on top — no recompute of the underlying mix.
  const rowsByPeriod = Object.fromEntries(
    Object.entries(PERIOD_DAYS).map(([key, days]) => [
      key,
      channelRows(data.channels, totalsOf(data.daily.slice(-days))),
    ])
  );

  return (
    <ModulePage moduleKey="zisk">
      <ProfitModule rowsByPeriod={rowsByPeriod} defaults={defaultMargins(data.channels)} />
    </ModulePage>
  );
}
