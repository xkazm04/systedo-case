/** Uložený obsah — the briefs and article drafts this project saved from the
 *  Obsahový engine. Real per-project user data (no fixtures), so no sample marker. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import SavedContentLibrary from "@/components/ai/SavedContentLibrary";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "ulozeny-obsah");
  return (
    <ModulePage moduleKey="ulozeny-obsah">
      <SavedContentLibrary />
    </ModulePage>
  );
}
