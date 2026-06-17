/** Produktová kreativa — catalog → RSA/PMax asset groups. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import CatalogModule from "@/components/app/modules/CatalogModule";
import { SAMPLE_PRODUCTS } from "@/lib/catalog/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "produktova-kreativa");
  return (
    <ModulePage moduleKey="produktova-kreativa">
      <CatalogModule products={SAMPLE_PRODUCTS} />
    </ModulePage>
  );
}
