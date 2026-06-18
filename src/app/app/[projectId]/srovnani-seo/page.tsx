/** Srovnání & SEO — high-intent comparison-query opportunities. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import CompareSeoModule from "@/components/app/modules/CompareSeoModule";
import { SAMPLE_QUERIES } from "@/lib/seo-compare/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "srovnani-seo");
  return (
    <ModulePage moduleKey="srovnani-seo">
      <CompareSeoModule queries={SAMPLE_QUERIES} />
    </ModulePage>
  );
}
