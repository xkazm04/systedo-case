/** Illustrative topic clusters + decaying posts for a content/media project.
 *  Real-integration seam: keyword tool + Search Console (traffic trend). */
import type { Project } from "@/lib/projects/types";
import { projectVary } from "@/lib/project-data/vary";

export interface ClusterArticle {
  title: string;
  type: "pillar" | "supporting";
  status: "published" | "planned";
  /** Whether this supporting article links to its cluster pillar. Undefined on the
   *  pillar itself; on a supporting article `false`/undefined = a missing internal
   *  link (silent link debt). Real-integration seam: a crawler / link audit. */
  linksToPillar?: boolean;
}

export interface TopicCluster {
  topic: string;
  /** combined monthly search volume of the cluster */
  volume: number;
  articles: ClusterArticle[];
}

export interface DecayingPost {
  title: string;
  monthsAgo: number;
  /** YoY organic traffic change (negative = decaying) */
  trafficChangePct: number;
}

export const SAMPLE_CLUSTERS: TopicCluster[] = [
  {
    topic: "spánek miminka",
    volume: 4200,
    articles: [
      { title: "Spánek miminka: kompletní průvodce", type: "pillar", status: "published" },
      { title: "Jak uspat novorozence", type: "supporting", status: "published", linksToPillar: true },
      { title: "Bílý šum a spánek", type: "supporting", status: "published", linksToPillar: false },
      { title: "Spánkový regres po měsících", type: "supporting", status: "planned" },
    ],
  },
  {
    topic: "kojení",
    volume: 3100,
    articles: [
      { title: "Kojení od A do Z", type: "pillar", status: "published" },
      { title: "Časté problémy při kojení", type: "supporting", status: "published", linksToPillar: true },
      { title: "Kojení a strava matky", type: "supporting", status: "planned" },
    ],
  },
  {
    topic: "příkrmy",
    volume: 2600,
    articles: [
      { title: "Příkrmy: kdy a jak začít", type: "pillar", status: "planned" },
      { title: "BLW metoda krok za krokem", type: "supporting", status: "published", linksToPillar: false },
    ],
  },
];

export const SAMPLE_DECAY: DecayingPost[] = [
  { title: "Nejlepší kočárky 2024", monthsAgo: 14, trafficChangePct: -0.38 },
  { title: "Výbavička do porodnice", monthsAgo: 9, trafficChangePct: -0.22 },
  { title: "Cvičení po porodu", monthsAgo: 11, trafficChangePct: -0.15 },
  { title: "Jak vybrat autosedačku", monthsAgo: 6, trafficChangePct: 0.04 },
];

/** Per-project topic clusters: the combined monthly search volume is scaled by a
 *  uniform per-project factor so each project reads at its own size. Article
 *  structure and the decay series (a time/percentage trend, not a magnitude) are
 *  project-independent and pass through untouched. */
export function clustersForProject(project: Project): TopicCluster[] {
  const v = projectVary(project, "content-engine");
  return SAMPLE_CLUSTERS.map((c) => ({ ...c, volume: v.int(c.volume) }));
}
