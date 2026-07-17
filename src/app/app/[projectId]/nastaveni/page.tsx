/** Nastavení — project settings (name, brand, type, delete), plus the per-user
 *  BYOM key management. The keys are ACCOUNT-WIDE (one set shared by every
 *  project), not per-project: an /ucet account module now exists, but the BYOM
 *  panel stays alongside the project's AI/model settings here where users manage
 *  models. ByomKeys states the scope in its own subtitle ("Platí pro celý účet…")
 *  so the placement doesn't mislead — saving/deleting a key in project A affects
 *  project B too. */
import { requireProjectModule } from "@/lib/projects/guard";
import { hasSyncedMetrics } from "@/lib/report-metrics/store";
import ModulePage from "@/components/app/ModulePage";
import ProjectSettings from "@/components/app/modules/ProjectSettings";
import ByomKeys from "@/components/app/modules/ByomKeys";
import ByomQualityOverview from "@/components/app/modules/ByomQualityOverview";
import ByomMatrix from "@/components/app/modules/ByomMatrix";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project } = await requireProjectModule(projectId, "nastaveni");
  // Honest "živá data" signal resolved server-side (synced rows, not just linked).
  const live = await hasSyncedMetrics(project.id);
  return (
    <ModulePage moduleKey="nastaveni">
      <ProjectSettings live={live} />
      <ByomKeys />
      <ByomQualityOverview />
      <ByomMatrix />
    </ModulePage>
  );
}
