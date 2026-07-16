/** Produktová kreativa — catalog → RSA/PMax asset groups. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import CatalogModule from "@/components/app/modules/CatalogModule";
import { loadProductsForWithSource } from "@/lib/catalog/load";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "produktova-kreativa");
  // Ground the demo copy + final URL in THIS project instead of a hardcoded shop
  // (BM-L1-02): clean the "(demo)" marker off the name for on-copy brand use.
  const brand = project.name.replace(/\s*\(demo\)\s*/i, "").trim();
  // Products come from the persisted catalog (the source of truth the Katalog
  // module writes), falling back to the seed only when nothing is saved. The
  // honesty banner follows that resolution — `sample` only when we're on the seed,
  // so a user's own saved catalog is never mislabeled "illustrative" (like obsah-plan
  // / experimenty-lp), instead of the old hardcoded `sample`.
  const { products, source } = await loadProductsForWithSource(project);
  return (
    <ModulePage moduleKey="produktova-kreativa" sample={source === "sample"}>
      <CatalogModule products={products} brand={brand} domain={project.domain ?? ""} />
    </ModulePage>
  );
}
