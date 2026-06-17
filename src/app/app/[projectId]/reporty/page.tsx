/** Reporty — shared client reports created from the Campaigns module. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import SharedReportsList from "@/components/campaigns/SharedReportsList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "reporty");
  return (
    <ModulePage
      moduleKey="reporty"
      description={'Sdílené reporty pro klienty — vytvoříte je v modulu Kampaně tlačítkem „Sdílet report". Zde je spravujete: počet zobrazení a zneplatnění odkazu.'}
    >
      <SharedReportsList refreshSignal={0} />
    </ModulePage>
  );
}
