/** Reporty — shared client reports created from the Campaigns module. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import SharedReportsList from "@/components/campaigns/SharedReportsList";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const T = {
  cs: {
    desc: "Sdílené reporty pro klienty — vytvoříte je v modulu Kampaně tlačítkem „Sdílet report“. Zde je spravujete: počet zobrazení a zneplatnění odkazu.",
  },
  en: {
    desc: "Shared reports for clients — create them in the Campaigns module using the “Share report” button. Manage them here: view count and link invalidation.",
  },
} as const;

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "reporty");
  const t = await getT(T);
  return (
    <ModulePage
      moduleKey="reporty"
      description={t("desc")}
    >
      <SharedReportsList refreshSignal={0} />
    </ModulePage>
  );
}
