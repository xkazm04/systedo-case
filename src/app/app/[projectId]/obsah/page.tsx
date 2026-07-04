/** Obsah & SEO — the AI content-brief tool (seeded from the keyword module). */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import ContentModule from "@/components/app/modules/ContentModule";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "obsah");
  return (
    <ModulePage moduleKey="obsah">
      <ContentModule />
    </ModulePage>
  );
}
