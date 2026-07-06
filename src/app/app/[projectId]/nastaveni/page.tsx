/** Nastavení — project settings (name, brand, type, delete), plus the per-user
 *  BYOM key management (account-wide, shown here since the app has no dedicated
 *  account area). */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import ProjectSettings from "@/components/app/modules/ProjectSettings";
import ByomKeys from "@/components/app/modules/ByomKeys";
import ByomMatrix from "@/components/app/modules/ByomMatrix";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "nastaveni");
  return (
    <ModulePage moduleKey="nastaveni">
      <ProjectSettings />
      <ByomKeys />
      <ByomMatrix />
    </ModulePage>
  );
}
