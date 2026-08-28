/** Server-side catalog resolution: the persisted catalog when the project has one,
 *  else the seed. This is the store-backed counterpart to the pure `resolve.ts`
 *  seed layer — authed module pages read through here so a user's saved offerings
 *  flow into every module; the demo route stays on the seed. Server-only. */
import "server-only";
import { cache } from "react";
import type { Project } from "@/lib/projects/types";
import type { Offering, PlanOffering, ServiceOffering } from "./offering";
import { isPlan, isService, toProducts } from "./offering";
import type { Product } from "./sample";
import { getProjectCatalog } from "./resolve";
import { listOfferings } from "./store";
import { currentUserId } from "@/lib/session";
import { isDemoProject } from "@/lib/projects/demo";

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
  return (await loadProjectCatalogWithSource(project, now)).offerings;
}

/** As {@link loadProjectCatalog}, but also reports whether the catalog is the user's
 *  own persisted data (`"catalog"`) or the illustrative seed (`"sample"`) — so a page
 *  can label the honesty banner truthfully instead of hardcoding `sample`. A demo
 *  project, an unauthenticated read, or a never-saved project all resolve to the seed
 *  (`"sample"`); a saved catalog — including an explicitly-empty `[]` — is `"catalog"`. */
export async function loadProjectCatalogWithSource(
  project: Project,
  now: Date = new Date()
): Promise<{ offerings: Offering[]; source: "catalog" | "sample" }> {
  if (isDemoProject(project)) return { offerings: getProjectCatalog(project, now), source: "sample" };
  const userId = await currentUserId();
  if (!userId) return { offerings: getProjectCatalog(project, now), source: "sample" };
  const stored = await readStoredOfferings(userId, project.id);
  return stored === null
    ? { offerings: getProjectCatalog(project, now), source: "sample" }
    : { offerings: stored, source: "catalog" };
}

export async function loadProductsFor(project: Project, now: Date = new Date()): Promise<Product[]> {
  return toProducts(await loadProjectCatalog(project, now));
}

/** Products plus the catalog's provenance (see {@link loadProjectCatalogWithSource}). */
export async function loadProductsForWithSource(
  project: Project,
  now: Date = new Date()
): Promise<{ products: Product[]; source: "catalog" | "sample" }> {
  const { offerings, source } = await loadProjectCatalogWithSource(project, now);
  return { products: toProducts(offerings), source };
}

export async function loadPlansFor(project: Project): Promise<PlanOffering[]> {
  return (await loadProjectCatalog(project)).filter(isPlan);
}

export async function loadServicesFor(project: Project): Promise<ServiceOffering[]> {
  return (await loadProjectCatalog(project)).filter(isService);
}
