/** Cluster coverage + content-decay selection + internal-link wiring. Pure. */
import type { ClusterArticle, DecayingPost, TopicCluster } from "./sample";

/** A published pillar carries the cluster's topical authority, so it is worth
 *  more than a published supporting page. Weighting completeness this way means a
 *  cluster with three supporting articles but no pillar still reads as incomplete. */
export const PILLAR_WEIGHT = 3;
export const SUPPORTING_WEIGHT = 1;

const articleWeight = (a: ClusterArticle): number =>
  a.type === "pillar" ? PILLAR_WEIGHT : SUPPORTING_WEIGHT;

/** One edge of the cluster's internal-link graph: a supporting article and
 *  whether it is wired to the pillar. `linked` is false when the link is missing
 *  (silent internal-link debt) — only meaningful once both pages are published. */
export interface ClusterLink {
  /** supporting article title (spoke) */
  from: string;
  /** pillar article title (hub), or null when the cluster has no pillar */
  to: string | null;
  linked: boolean;
  /** false until the supporting page is published (no live link possible yet) */
  published: boolean;
}

export interface ClusterLinkGraph {
  pillar: ClusterArticle | null;
  links: ClusterLink[];
  /** published supporting articles whose link to the pillar is missing */
  missingLinks: number;
}

export interface ClusterStat extends TopicCluster {
  published: number;
  total: number;
  /** published / total */
  coverage: number;
  /** weighted share of the cluster that is published (pillar worth more) */
  completeness: number;
  /** whether the cluster has a pillar article at all */
  hasPillar: boolean;
  /** the highest-leverage planned article to write next, or null when none remain */
  nextGap: ClusterArticle | null;
  /** pillar ⇄ supporting wiring */
  graph: ClusterLinkGraph;
}

/** Weighted completeness: sum of published article weights over the total weight
 *  of every planned + published article. A missing pillar leaves a big gap even
 *  when every supporting page is live. */
export function completeness(c: TopicCluster): number {
  const totalWeight = c.articles.reduce((sum, a) => sum + articleWeight(a), 0);
  if (!totalWeight) return 0;
  const publishedWeight = c.articles
    .filter((a) => a.status === "published")
    .reduce((sum, a) => sum + articleWeight(a), 0);
  return publishedWeight / totalWeight;
}

/** The next article worth writing: a missing (planned) pillar always wins — it
 *  unlocks the cluster's authority — otherwise the planned supporting article in
 *  the highest-volume cluster context. Returns null when nothing is planned. */
export function nextGap(c: TopicCluster): ClusterArticle | null {
  const planned = c.articles.filter((a) => a.status === "planned");
  if (planned.length === 0) return null;
  const pillarGap = planned.find((a) => a.type === "pillar");
  return pillarGap ?? planned[0];
}

/** Hub-and-spoke link state for a cluster: every supporting article is a spoke;
 *  a published spoke that does not link to a published pillar is link debt. */
export function clusterLinkGraph(c: TopicCluster): ClusterLinkGraph {
  const pillar = c.articles.find((a) => a.type === "pillar") ?? null;
  const pillarPublished = pillar?.status === "published";
  const links: ClusterLink[] = c.articles
    .filter((a) => a.type === "supporting")
    .map((a) => {
      const published = a.status === "published";
      // a live link requires both pages published and the flag set
      const linked = published && pillarPublished && a.linksToPillar === true;
      return { from: a.title, to: pillar?.title ?? null, linked, published };
    });
  const missingLinks = links.filter((l) => l.published && pillarPublished && !l.linked).length;
  return { pillar, links, missingLinks };
}

export function clusterStats(c: TopicCluster): ClusterStat {
  const published = c.articles.filter((a) => a.status === "published").length;
  const hasPillar = c.articles.some((a) => a.type === "pillar");
  return {
    ...c,
    published,
    total: c.articles.length,
    coverage: c.articles.length ? published / c.articles.length : 0,
    completeness: completeness(c),
    hasPillar,
    nextGap: nextGap(c),
    graph: clusterLinkGraph(c),
  };
}

/** All clusters as stats, least-complete first (where the next article matters
 *  most). Ties break on cluster volume so the bigger opportunity surfaces above. */
export function rankedClusterStats(clusters: TopicCluster[]): ClusterStat[] {
  return clusters
    .map(clusterStats)
    .sort((a, b) => a.completeness - b.completeness || b.volume - a.volume);
}

/** Posts losing meaningful organic traffic, worst first. */
export const DECAY_THRESHOLD = -0.1;

export function decayingPosts(posts: DecayingPost[]): DecayingPost[] {
  return posts
    .filter((p) => p.trafficChangePct < DECAY_THRESHOLD)
    .sort((a, b) => a.trafficChangePct - b.trafficChangePct);
}
