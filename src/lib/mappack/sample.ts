/** Illustrative local map-pack data for a local-SEO project: the pack of five
 *  businesses competing in each locality's map (you vs. named rivals), with real
 *  city-center coordinates + seeded jitter so the Leaflet map has genuine geo,
 *  plus a keyword ranking ladder (per-keyword rank history). Real-integration
 *  seam: a SERP / Places aggregator + a rank tracker. Everything is seeded off
 *  the project id + locality so it stays stable across requests and varies per
 *  project. Framework-free. */
import type { Project } from "@/lib/projects/types";
import type { Locality, ServiceOffering } from "@/lib/catalog/offering";
import { seed01 } from "@/lib/project-data/seed";

/** Real city-center coordinates for the seeded demo localities — the map centers
 *  here and competitors are jittered around it. A locality outside this table
 *  falls back to Praha's centre (still spread by the per-listing jitter). */
export const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  praha: { lat: 50.0755, lng: 14.4378 },
  brno: { lat: 49.1951, lng: 16.6068 },
  ostrava: { lat: 49.8209, lng: 18.2625 },
  plzen: { lat: 49.7384, lng: 13.3736 },
};

const RIVAL_NAMES = [
  "Centrum Nova",
  "Studio Alfa",
  "Klinika Prima",
  "Rodinné centrum",
  "Expert Plus",
  "Atelier Vega",
];

export interface MapListing {
  id: string;
  /** position in the local map pack (1 = top) */
  rank: number;
  name: string;
  you: boolean;
  rating: number;
  reviews: number;
  lat: number;
  lng: number;
}

export interface AreaPack {
  areaId: string;
  city: string;
  center: { lat: number; lng: number };
  listings: MapListing[];
}

export interface KeywordRank {
  id: string;
  keyword: string;
  area: string;
  /** oldest → newest local rank (1 = best) */
  history: number[];
  current: number;
  best: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

function pickRivals(projectId: string, areaId: string, n: number): string[] {
  const start = Math.floor(seed01(`${projectId}:rivals:${areaId}`) * RIVAL_NAMES.length);
  return Array.from({ length: n }, (_, i) => RIVAL_NAMES[(start + i) % RIVAL_NAMES.length]);
}

/** The five-business map pack for one locality. `you` sits at a seeded rank
 *  (1–4) so the pack reads as a real competitive picture; rivals fill the rest. */
export function packForArea(project: Project, locality: Locality, businessName: string): AreaPack {
  const center = CITY_COORDS[locality.id] ?? CITY_COORDS.praha;
  const s = (k: string) => seed01(`${project.id}:pack:${locality.id}:${k}`);
  const yourRank = 1 + Math.round(s("yourrank") * 3); // 1..4
  const rivals = pickRivals(project.id, locality.id, 5);

  let rivalCursor = 0;
  const listings: MapListing[] = [1, 2, 3, 4, 5].map((rank) => {
    const you = rank === yourRank;
    const name = you ? businessName : rivals[rivalCursor++];
    const g = (k: string) => seed01(`${project.id}:pack:${locality.id}:${rank}:${k}`);
    return {
      id: `${locality.id}-${rank}`,
      rank,
      name,
      you,
      rating: round1(4.1 + g("rate") * 0.85),
      reviews: 8 + Math.round(g("rev") * 220),
      lat: round5(center.lat + (g("lat") - 0.5) * 0.024),
      lng: round5(center.lng + (g("lng") - 0.5) * 0.032),
    };
  });

  return { areaId: locality.id, city: locality.name, center, listings };
}

/** One map pack per locality the business operates in. */
export function packsForProject(
  project: Project,
  localities: Locality[],
  businessName: string
): AreaPack[] {
  return localities.map((l) => packForArea(project, l, businessName));
}

/** Keyword ranking ladder: a rank history per tracked service×area, trending from
 *  a weaker start toward the current position. Capped at `limit` rows so the
 *  ladder stays scannable. */
export function keywordLadder(
  project: Project,
  localities: Locality[],
  services: ServiceOffering[],
  limit = 6
): KeywordRank[] {
  const areaName = new Map(localities.map((l) => [l.id, l.name]));
  const out: KeywordRank[] = [];
  for (const svc of services) {
    for (const areaId of svc.serviceAreas) {
      const city = areaName.get(areaId);
      if (!city) continue;
      const g = (k: string) => seed01(`${project.id}:kw:${svc.name}:${areaId}:${k}`);
      const start = 5 + Math.round(g("start") * 9); // 5..14
      const target = 1 + Math.round(g("cur") * 5); // 1..6
      const points = 8;
      const history = Array.from({ length: points }, (_, i) => {
        const t = i / (points - 1);
        const base = start + (target - start) * t;
        const noise = (seed01(`${project.id}:kw:${svc.name}:${areaId}:p${i}`) - 0.5) * 1.6;
        return Math.max(1, Math.round(base + noise));
      });
      out.push({
        id: `${svc.id}:${areaId}`,
        keyword: `${svc.name} · ${city}`,
        area: city,
        history,
        current: history[history.length - 1],
        best: Math.min(...history),
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
