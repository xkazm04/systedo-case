/** Server helper: load a project's catalogue (stored + seeded) and derive its brand
 *  context in one call, so the social route and the WeekPlanner endpoint share one
 *  derivation (C1). Keep the pure `deriveBrandContext` separate for unit testing. */
import type { Project } from "@/lib/projects/types";
import type { SupportedLocale } from "@/lib/format";
import { loadProjectCatalog } from "@/lib/catalog/load";
import { deriveBrandContext } from "./context";

export async function loadBrandContext(
  project: Project,
  locale: SupportedLocale = "cs"
): Promise<string> {
  const offerings = await loadProjectCatalog(project);
  return deriveBrandContext(project, offerings, locale);
}
