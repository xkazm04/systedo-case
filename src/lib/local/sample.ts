/** Illustrative service×area coverage + review reputation for a lead-gen project.
 *  Real-integration seam: Google Business Profile, a rank tracker, and a reviews
 *  API; pages shipped as microsites (/m/[slug]). */

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
