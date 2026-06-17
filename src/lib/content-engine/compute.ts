/** Cluster coverage + content-decay selection. Pure. */
import type { DecayingPost, TopicCluster } from "./sample";

export interface ClusterStat extends TopicCluster {
  published: number;
  total: number;
  /** published / total */
  coverage: number;
}

export function clusterStats(c: TopicCluster): ClusterStat {
  const published = c.articles.filter((a) => a.status === "published").length;
  return { ...c, published, total: c.articles.length, coverage: c.articles.length ? published / c.articles.length : 0 };
}

/** Posts losing meaningful organic traffic, worst first. */
export const DECAY_THRESHOLD = -0.1;

export function decayingPosts(posts: DecayingPost[]): DecayingPost[] {
  return posts
    .filter((p) => p.trafficChangePct < DECAY_THRESHOLD)
    .sort((a, b) => a.trafficChangePct - b.trafficChangePct);
}
