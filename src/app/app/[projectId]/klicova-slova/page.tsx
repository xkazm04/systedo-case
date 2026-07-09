/** Klíčová slova — keyword research + saved lists. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import KeywordsModule from "@/components/app/modules/KeywordsModule";


export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ seed?: string }>;
}) {
  const { projectId } = await params;
  const { seed } = await searchParams;
  await requireProjectModule(projectId, "klicova-slova");
  return (
    <ModulePage moduleKey="klicova-slova">
      <KeywordsModule initialSeed={seed?.trim() || undefined} />
    </ModulePage>
  );
}
