/** Server-side catalog resolution: the persisted catalog when the project has one,
 *  else the seed. This is the store-backed counterpart to the pure `resolve.ts`
 *  seed layer — authed module pages read through here so a user's saved offerings
 *  flow into every module; the demo route stays on the seed. Server-only. */
import "server-only";
import type { Project } from "@/lib/projects/types";
import type { Offering, PlanOffering, ServiceOffering } from "./offering";
import { isPlan, isProduct, isService, toProduct } from "./offering";
import type { Product } from "./sample";
import { getProjectCatalog } from "./resolve";
import { listOfferings } from "./store";
import { currentUserId } from "@/lib/session";

/** A project's catalog: persisted offerings when present, otherwise the seed. Demo
 *  projects are never persisted. `stored ?? seed` — an explicitly-empty saved
 *  catalog ([]) is honored; only a never-saved project (null) falls back to the seed. */
export async function loadProjectCatalog(project: Project, now: Date = new Date()): Promise<Offering[]> {
  if (project.id.startsWith("demo-")) return getProjectCatalog(project, now);
  const userId = await currentUserId();
  if (!userId) return getProjectCatalog(project, now);
  const stored = await listOfferings(userId, project.id);
  return stored ?? getProjectCatalog(project, now);
}

export async function loadProductsFor(project: Project, now: Date = new Date()): Promise<Product[]> {
  return (await loadProjectCatalog(project, now)).filter(isProduct).map(toProduct);
}

export async function loadPlansFor(project: Project): Promise<PlanOffering[]> {
  return (await loadProjectCatalog(project)).filter(isPlan);
}

export async function loadServicesFor(project: Project): Promise<ServiceOffering[]> {
  return (await loadProjectCatalog(project)).filter(isService);
}
