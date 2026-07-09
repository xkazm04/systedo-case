/** Produktová kreativa — catalog → RSA/PMax asset groups. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import CatalogModule from "@/components/app/modules/CatalogModule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { SAMPLE_PRODUCTS } from "@/lib/catalog/sample";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "produktova-kreativa");
  // Ground the demo copy + final URL in THIS project instead of a hardcoded shop
  // (BM-L1-02): clean the "(demo)" marker off the name for on-copy brand use.
  const brand = project.name.replace(/\s*\(demo\)\s*/i, "").trim();
  return (
    <ModulePage moduleKey="produktova-kreativa">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <CatalogModule products={SAMPLE_PRODUCTS} brand={brand} domain={project.domain ?? ""} />
    </ModulePage>
  );
}
