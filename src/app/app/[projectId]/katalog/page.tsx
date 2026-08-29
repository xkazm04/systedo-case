/** Katalog — the project's business catalog manager (products / plans / services).
 *  The source of truth the smart modules read from. */
import dynamic from "next/dynamic";
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import SectionSkeleton from "@/components/app/SectionSkeleton";
import CatalogManagerModule from "@/components/app/modules/CatalogManagerModule";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadProjectCatalog } from "@/lib/catalog/load";
import { warehouseConnectionFor } from "@/lib/inventory/warehouse";

/** The change ledger is a SECOND section under the manager, not an edit inside it:
 *  CatalogManagerModule is already 977 LOC of existing debt (docs/roadmap/
 *  component-debt.md) and the timeline shares none of its state. Lazily loaded — it
 *  fetches its own data client-side, so nothing above it waits on the ledger read. */
const CatalogLedgerSection = dynamic(
  () => import("@/components/app/modules/catalog/CatalogLedgerSection"),
  { loading: () => <SectionSkeleton height="h-72" /> }
);

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project } = await requireProjectModule(projectId, "katalog");
  // Reference "now" from the dataset's last day, so product restock ETAs are
  // deterministic (matches the Sklad module).
  const data = getProjectDataset(project);
  const lastDate = data.daily.at(-1)?.date;
  const now = lastDate ? new Date(`${lastDate}T00:00:00Z`) : new Date();

  const offerings = await loadProjectCatalog(project, now);
  const connection = project.type === "eshop" ? warehouseConnectionFor(project.id, now) : null;

  return (
    <ModulePage moduleKey="katalog">
      <CatalogManagerModule
        offerings={offerings}
        connection={connection}
        localities={localitiesFor(project)}
        projectType={project.type}
        projectName={project.name}
        projectId={project.id}
        persistable
      />
      <div className="mt-10">
        <CatalogLedgerSection projectId={project.id} />
      </div>
    </ModulePage>
  );
}
