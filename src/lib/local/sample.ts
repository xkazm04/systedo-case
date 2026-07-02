/** Illustrative service×area coverage + review reputation for a lead-gen project.
 *  Real-integration seam: Google Business Profile, a rank tracker, and a reviews
 *  API; pages shipped as microsites (/m/[slug]). */
import type { Project } from "@/lib/projects/types";
import { projectVary } from "@/lib/project-data/vary";

export interface LocalTarget {
  area: string;
  service: string;
  /** monthly local search volume */
  monthlyVolume: number;
  /** a dedicated landing/microsite exists */
  hasPage: boolean;
  /** local SERP position, or null if not ranking */
  rank: number | null;
}

export interface ReviewProfile {
  area: string;
  reviews: number;
  rating: number;
}

/** A single illustrative public review — the unit a reply is drafted for. */
export interface RecentReview {
  id: string;
  area: string;
  author: string;
  /** star rating 1–5 */
  rating: number;
  text: string;
}

export const SAMPLE_TARGETS: LocalTarget[] = [
  { area: "Praha", service: "Montáž klimatizací", monthlyVolume: 880, hasPage: true, rank: 4 },
  { area: "Praha", service: "Servis a revize", monthlyVolume: 540, hasPage: true, rank: 7 },
  { area: "Praha", service: "Rekonstrukce rozvodů", monthlyVolume: 320, hasPage: false, rank: null },
  { area: "Brno", service: "Montáž klimatizací", monthlyVolume: 480, hasPage: true, rank: 9 },
  { area: "Brno", service: "Servis a revize", monthlyVolume: 290, hasPage: false, rank: null },
  { area: "Ostrava", service: "Montáž klimatizací", monthlyVolume: 350, hasPage: false, rank: null },
  { area: "Ostrava", service: "Rekonstrukce rozvodů", monthlyVolume: 180, hasPage: false, rank: null },
  { area: "Plzeň", service: "Montáž klimatizací", monthlyVolume: 240, hasPage: true, rank: 12 },
  { area: "Plzeň", service: "Servis a revize", monthlyVolume: 160, hasPage: false, rank: null },
];

export const SAMPLE_REVIEWS: ReviewProfile[] = [
  { area: "Praha", reviews: 128, rating: 4.8 },
  { area: "Brno", reviews: 74, rating: 4.7 },
  { area: "Ostrava", reviews: 31, rating: 4.5 },
  { area: "Plzeň", reviews: 19, rating: 4.9 },
];

/** A few illustrative public reviews spanning high and low ratings — the seam for
 *  a reviews API (Google Business Profile). Each can be answered with an AI draft. */
/** Per-project local targets: monthly local search volume scales by a uniform
 *  per-project factor; SERP rank and whether a page exists are project-specific
 *  states, not magnitudes, so they pass through untouched. */
export function targetsForProject(project: Project): LocalTarget[] {
  const v = projectVary(project, "local");
  return SAMPLE_TARGETS.map((t) => ({ ...t, monthlyVolume: v.int(t.monthlyVolume) }));
}

/** Per-project review profiles: the review COUNT scales per project; the star
 *  rating is bounded 1–5 and passes through unchanged. */
export function reviewsForProject(project: Project): ReviewProfile[] {
  const v = projectVary(project, "local-reviews");
  return SAMPLE_REVIEWS.map((r) => ({ ...r, reviews: v.int(r.reviews) }));
}

export const SAMPLE_RECENT_REVIEWS: RecentReview[] = [
  {
    id: "rev-praha-1",
    area: "Praha",
    author: "Jana K.",
    rating: 5,
    text: "Rychlá montáž klimatizace, technici dorazili na čas a vše po sobě uklidili. Můžu jen doporučit.",
  },
  {
    id: "rev-brno-1",
    area: "Brno",
    author: "Petr M.",
    rating: 4,
    text: "Spokojenost, jen objednací termín byl o něco delší, než jsem čekal. Práce ale odvedená dobře.",
  },
  {
    id: "rev-ostrava-1",
    area: "Ostrava",
    author: "Lukáš V.",
    rating: 2,
    text: "Technik přijel o dvě hodiny později a nezavolal předem. Samotná oprava nakonec dopadla v pořádku, ale komunikace vázla.",
  },
  {
    id: "rev-plzen-1",
    area: "Plzeň",
    author: "Markéta S.",
    rating: 1,
    text: "Domluvený termín servisu nikdo nedodržel a na telefonu se nikdo neozval. Velké zklamání.",
  },
];
