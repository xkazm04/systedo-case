/** Klíčová slova — keyword research + saved lists. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import KeywordsModule from "@/components/app/modules/KeywordsModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "klicova-slova");
  return (
    <ModulePage moduleKey="klicova-slova">
      <KeywordsModule />
    </ModulePage>
  );
}
