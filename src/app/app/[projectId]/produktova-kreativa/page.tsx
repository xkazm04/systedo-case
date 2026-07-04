/** Produktová kreativa — catalog → RSA/PMax asset groups. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import CatalogModule from "@/components/app/modules/CatalogModule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { SAMPLE_PRODUCTS } from "@/lib/catalog/sample";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "produktova-kreativa");
  return (
    <ModulePage moduleKey="produktova-kreativa">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <CatalogModule products={SAMPLE_PRODUCTS} />
    </ModulePage>
  );
}
