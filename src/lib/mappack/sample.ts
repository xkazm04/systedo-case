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

/** One time-anchored observation in a keyword's rank history. Replaces the old
 *  bare `number` point so the ladder can say WHEN a rank was measured — the whole
 *  point of a rank tracker (D1). Legacy bare-number blobs are coerced to this shape
 *  on read (normalizeLadder in local-signals/import). */
export interface RankPoint {
  /** local rank (1 = best) observed at `at` */
  rank: number;
  /** ISO date (YYYY-MM-DD) of the observation */
  at: string;
}

export interface KeywordRank {
  id: string;
  keyword: string;
  area: string;
  /** oldest → newest local rank observations (1 = best), each date-stamped */
  history: RankPoint[];
  current: number;
  best: number;
  /** D2 retention flag: true when this keyword was in the tracked set but ABSENT from
   *  the most recent import (its history is preserved, not deleted). Undefined/false =
   *  present in the last import. Only imported ladders set it; the sample never does. */
  untracked?: boolean;
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

/** Days the seeded sample history spans (newest point at `endDate`, oldest this
 *  many days earlier) — mirrors a ~quarter of monthly-ish tracking so the demo
 *  ladder renders an honest "Vývoj (N dní)" span identical in shape to real data. */
const SAMPLE_SPAN_DAYS = 90;
const DAY_MS = 86_400_000;

/** Keyword ranking ladder: a rank history per tracked service×area, trending from
 *  a weaker start toward the current position. Each point carries a synthetic date
 *  (evenly spaced, newest at `endDate`) so the sample renders the same time-anchored
 *  UI as an imported ladder. Capped at `limit` rows so the ladder stays scannable. */
export function keywordLadder(
  project: Project,
  localities: Locality[],
  services: ServiceOffering[],
  limit = 6,
  endDate: Date = new Date()
): KeywordRank[] {
  const areaName = new Map(localities.map((l) => [l.id, l.name]));
  const end = endDate.getTime();
  const out: KeywordRank[] = [];
  for (const svc of services) {
    for (const areaId of svc.serviceAreas) {
      const city = areaName.get(areaId);
      if (!city) continue;
      const g = (k: string) => seed01(`${project.id}:kw:${svc.name}:${areaId}:${k}`);
      const start = 5 + Math.round(g("start") * 9); // 5..14
      const target = 1 + Math.round(g("cur") * 5); // 1..6
      const points = 8;
      const step = SAMPLE_SPAN_DAYS / (points - 1);
      const history: RankPoint[] = Array.from({ length: points }, (_, i) => {
        const t = i / (points - 1);
        const base = start + (target - start) * t;
        const noise = (seed01(`${project.id}:kw:${svc.name}:${areaId}:p${i}`) - 0.5) * 1.6;
        const rank = Math.max(1, Math.round(base + noise));
        const at = new Date(end - (points - 1 - i) * step * DAY_MS).toISOString().slice(0, 10);
        return { rank, at };
      });
      out.push({
        id: `${svc.id}:${areaId}`,
        keyword: `${svc.name} · ${city}`,
        area: city,
        history,
        current: history[history.length - 1]!.rank,
        best: Math.min(...history.map((p) => p.rank)),
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
