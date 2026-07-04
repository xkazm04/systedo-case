/** Kreativa — the Creative Studio image tool. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import CreativeStudio from "@/components/ai/CreativeStudio";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "kreativa");
  return (
    <ModulePage moduleKey="kreativa">
      <CreativeStudio />
    </ModulePage>
  );
}
