/** Nastavení — project settings (name, brand, type, delete). */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import ProjectSettings from "@/components/app/modules/ProjectSettings";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "nastaveni");
  return (
    <ModulePage moduleKey="nastaveni">
      <ProjectSettings />
    </ModulePage>
  );
}
