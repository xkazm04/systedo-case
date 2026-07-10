/** The single seam every module reads business data through. PHASE 1 resolves a
 *  seeded per-type catalog; it mirrors `getProjectDataset(project)` and the existing
 *  sample→live source pattern (`projectDataSource`, `warehouseConnectionFor`). Phase 2
 *  swaps the seed lookup for a project-scoped store without changing these signatures. */
import type { Project } from "@/lib/projects/types";
import type { Locality, Offering, PlanOffering, ServiceOffering } from "./offering";
import { isPlan, isProduct, isService, toProduct } from "./offering";
import type { Product } from "./sample";
import { LOCALITIES, appCatalog, contentCatalog, eshopCatalog, leadgenCatalog, localSeoCatalog } from "./seeds";

/** A project's full business catalog (mixed kinds). `now` scopes product restock ETAs
 *  deterministically when the caller derives it from the dataset's last day. */
export function getProjectCatalog(project: Project, now: Date = new Date()): Offering[] {
  switch (project.type) {
    case "eshop":
      return eshopCatalog(project.id, now);
    case "app":
      return appCatalog(project.id);
    case "leadgen":
      return leadgenCatalog(project.id);
    case "content":
      return contentCatalog(project.id);
    case "local":
      return localSeoCatalog(project.id);
  }
}

/** Product offerings adapted to the legacy `Product` shape (inventory / creative). */
export function productsFor(project: Project, now: Date = new Date()): Product[] {
  return getProjectCatalog(project, now).filter(isProduct).map(toProduct);
}

export function plansFor(project: Project): PlanOffering[] {
  return getProjectCatalog(project).filter(isPlan);
}

export function servicesFor(project: Project): ServiceOffering[] {
  return getProjectCatalog(project).filter(isService);
}

/** Localities a local/service business operates in (empty for non-local types). */
export function localitiesFor(project: Project): Locality[] {
  return project.type === "leadgen" || project.type === "local" ? LOCALITIES : [];
}
