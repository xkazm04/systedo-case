/** Lokální dominance — service×area coverage gaps + reputation. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LocalModule from "@/components/app/modules/LocalModule";
import { SAMPLE_REVIEWS, SAMPLE_TARGETS } from "@/lib/local/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "lokalni");
  return (
    <ModulePage moduleKey="lokalni">
      <LocalModule targets={SAMPLE_TARGETS} reviews={SAMPLE_REVIEWS} />
    </ModulePage>
  );
}
