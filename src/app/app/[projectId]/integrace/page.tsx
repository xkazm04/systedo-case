/** Integrace / Integration status — connector-readiness board for the project
 *  (the "on-demand deployment" view). Reads real environment + project config
 *  server-side; account-level, so available for every project type. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import IntegrationStatusModule from "@/components/app/modules/IntegrationStatusModule";
import { integrationStatus } from "@/lib/integrations/status";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, userId } = await requireProjectModule(projectId, "integrace");
  const rows = await integrationStatus(project, userId);
  return (
    <ModulePage moduleKey="integrace">
      <IntegrationStatusModule rows={rows} />
    </ModulePage>
  );
}
