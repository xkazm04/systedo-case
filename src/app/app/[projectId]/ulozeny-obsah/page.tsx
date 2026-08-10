/** Uložený obsah — the briefs and article drafts this project saved from the
 *  Obsahový engine. Real per-project user data (no fixtures), so no sample marker. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import SavedContentLibrary from "@/components/ai/SavedContentLibrary";


export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  /** `?entry=<id>` — the plan slot's "Uložený koncept" link, which used to land on
   *  the module root and leave the maker to find their own draft in the list. */
  searchParams: Promise<{ entry?: string }>;
}) {
  const { projectId } = await params;
  const { entry } = await searchParams;
  await requireProjectModule(projectId, "ulozeny-obsah");
  return (
    <ModulePage moduleKey="ulozeny-obsah">
      <SavedContentLibrary entryId={entry?.trim() || undefined} />
    </ModulePage>
  );
}
