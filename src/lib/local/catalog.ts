/** Catalog-grounded local coverage — build the service×locality matrix rows from the
 *  project's service offerings (each service × the localities it's offered in). Search
 *  volume, page-coverage and local rank are seeded deterministically off service|area
 *  (the rank-tracker / GBP seam supplies the real figures). */
import type { Locality, ServiceOffering } from "@/lib/catalog/offering";
import { seed01 } from "@/lib/project-data/seed";
import type { LocalTarget } from "./sample";

export function targetsFromCatalog(services: ServiceOffering[], localities: Locality[]): LocalTarget[] {
  const byId = new Map(localities.map((l) => [l.id, l]));
  const out: LocalTarget[] = [];
  for (const s of services) {
    for (const areaId of s.serviceAreas) {
      const loc = byId.get(areaId);
      if (!loc) continue;
      const k = `${s.name}|${loc.id}`;
      const monthlyVolume = Math.round((300 + seed01(`${k}:vol`) * 2200) / 10) * 10;
      const hasPage = seed01(`${k}:page`) > 0.32;
      const rank = hasPage ? Math.max(1, Math.round(seed01(`${k}:rank`) * 18)) : null;
      out.push({ area: loc.name, service: s.name, monthlyVolume, hasPage, rank });
    }
  }
  return out;
}
