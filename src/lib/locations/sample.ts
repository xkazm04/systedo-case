/** Illustrative per-location operational data for a local-SEO project — the
 *  "location management" roster (its principles ported from the local-SEO app's
 *  companies view, adapted to Adamant's per-project model: the roster is the
 *  business's own branches/locations rather than a multi-client fleet).
 *
 *  Grounded on the project's localities × its service catalog; every metric is
 *  seeded deterministically off the project id + locality (the real integration
 *  seam is Google Business Profile + a reviews API + a rank tracker), so it stays
 *  stable across requests and varies per project. */
import type { Project } from "@/lib/projects/types";
import type { Locality, ServiceOffering } from "@/lib/catalog/offering";
import { seed01 } from "@/lib/project-data/seed";

/** Google Business Profile connection health for a location. */
export type GbpStatus = "connected" | "attention" | "disconnected";

export interface LocationRow {
  id: string;
  /** location name (city) */
  name: string;
  region: string;
  /** how many of the project's services are offered here */
  services: number;
  gbp: GbpStatus;
  /** the location's work is running on autopilot (drafts auto-published etc.) */
  autopilot: boolean;
  /** review-star rating, 1 decimal */
  rating: number;
  reviews: number;
  /** reviews still awaiting a reply */
  unanswered: number;
  /** average map-pack position (1 = best) */
  mapRank: number;
  /** open tasks assigned to this location */
  openTasks: number;
  /** items a human flagged for the owner */
  flagged: number;
  /** drafts pending approval */
  drafts: number;
  /** monthly ad budget cap (CZK) */
  monthlyBudget: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Build the location roster from the project's localities × service catalog.
 *  `services` counts how many offerings cover each locality; the rest is seeded
 *  deterministically. Pure. */
export function locationsFromCatalog(
  project: Project,
  localities: Locality[],
  services: ServiceOffering[]
): LocationRow[] {
  return localities.map((loc) => {
    const s = (k: string) => seed01(`${project.id}:loc:${loc.id}:${k}`);
    const servicesHere = services.filter((sv) => sv.serviceAreas.includes(loc.id)).length;

    const gbpRoll = s("gbp");
    const gbp: GbpStatus = gbpRoll > 0.4 ? "connected" : gbpRoll > 0.15 ? "attention" : "disconnected";

    const reviews = 12 + Math.round(s("rev") * 188);
    const rating = round1(4.2 + s("rate") * 0.75);
    const unanswered = Math.round(s("unans") * 6);
    const mapRank = 1 + Math.round(s("rank") * 13);
    const openTasks = Math.round(s("tasks") * 7);
    const flagged = s("flag") > 0.72 ? 1 + Math.round(s("flagn") * 2) : 0;
    const drafts = Math.round(s("draft") * 4);
    const monthlyBudget = (5 + Math.round(s("bud") * 25)) * 1000;

    return {
      id: loc.id,
      name: loc.name,
      region: loc.region ?? "",
      services: servicesHere,
      gbp,
      autopilot: s("auto") > 0.42,
      rating,
      reviews,
      unanswered,
      mapRank,
      openTasks,
      flagged,
      drafts,
      monthlyBudget,
    };
  });
}
