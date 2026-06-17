/** Knihovna vzorů — the patterns library, re-hosted inside the project shell. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import PatternsLibrary from "@/components/patterns/PatternsLibrary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "knihovna");
  return (
    <ModulePage moduleKey="knihovna">
      <PatternsLibrary />
    </ModulePage>
  );
}
