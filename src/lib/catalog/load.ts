/** Server-side catalog resolution: the persisted catalog when the project has one,
 *  else the seed. This is the store-backed counterpart to the pure `resolve.ts`
 *  seed layer — authed module pages read through here so a user's saved offerings
 *  flow into every module; the demo route stays on the seed. Server-only. */
import "server-only";
import { cache } from "react";
import type { Project } from "@/lib/projects/types";
import type { Offering, PlanOffering, ServiceOffering } from "./offering";
import { isPlan, isProduct, isService, toProduct } from "./offering";
import type { Product } from "./sample";
import { getProjectCatalog } from "./resolve";
import { listOfferings } from "./store";
import { currentUserId } from "@/lib/session";

/** The request-deduped store read. React `cache()` memoizes for the lifetime of ONE
 *  server request, so when a page (or the ads grounding) resolves brand context AND
 *  products AND services on the same navigation, the catalog blob is read from the
 *  store exactly once — mirroring session.ts's `currentUserId` dedup.
 *
 *  It is the STORE READ that is cached, not `loadProjectCatalog` as a whole: the
 *  latter carries a `now: Date = new Date()` default that materializes a fresh Date
 *  per call, which would defeat memoization (every caller a distinct cache key). The
 *  key here is the pair of stable primitives (userId, projectId) — identical across
 *  loadProductsFor / loadPlansFor / loadServicesFor / loadBrandContext within a
 *  request — while the cheap, pure seed composition (`getProjectCatalog`) still runs
 *  per call. Request-scoped only: no cross-request cache, so per-user data stays fresh. */
const readStoredOfferings = cache(
  (userId: string, projectId: string): Promise<Offering[] | null> => listOfferings(userId, projectId)
);

/** A project's catalog: persisted offerings when present, otherwise the seed. Demo
 *  projects are never persisted. `stored ?? seed` — an explicitly-empty saved
 *  catalog ([]) is honored; only a never-saved project (null) falls back to the seed. */
export async function loadProjectCatalog(project: Project, now: Date = new Date()): Promise<Offering[]> {
  if (project.id.startsWith("demo-")) return getProjectCatalog(project, now);
  const userId = await currentUserId();
  if (!userId) return getProjectCatalog(project, now);
  const stored = await readStoredOfferings(userId, project.id);
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
