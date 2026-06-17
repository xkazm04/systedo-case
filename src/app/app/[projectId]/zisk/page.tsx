/** Zisk (POAS) — margin-aware profit view over the channel mix. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import ProfitModule from "@/components/app/modules/ProfitModule";
import { performance } from "@/lib/data";
import { channelRows, totalsOf } from "@/lib/metrics";
import { defaultMargins } from "@/lib/profit/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERIOD_DAYS: Record<string, number> = { "30": 30, "90": 90, "365": 365 };

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "zisk");

  // Precompute the channel mix per period on the server; the client only re-applies
  // the (live-editable) margin model on top — no recompute of the underlying mix.
  const rowsByPeriod = Object.fromEntries(
    Object.entries(PERIOD_DAYS).map(([key, days]) => [
      key,
      channelRows(performance.channels, totalsOf(performance.daily.slice(-days))),
    ])
  );

  return (
    <ModulePage moduleKey="zisk">
      <ProfitModule rowsByPeriod={rowsByPeriod} defaults={defaultMargins(performance.channels)} />
    </ModulePage>
  );
}
