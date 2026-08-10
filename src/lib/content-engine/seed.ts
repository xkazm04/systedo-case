/** Brief seeds — the pure builders behind every "create content" entry point.
 *
 *  A seed is what prefills the Tvorba workspace's brief. It used to be built inline
 *  at each entry point, which is how the two kanály paths drifted apart (the drawer
 *  wrote a real seed, the row CTA wrote none and landed the maker in a blank
 *  workspace). One builder per origin, here, keeps them honest — and testable
 *  without a browser (test-unit/content-engine-seed.test.mjs).
 *
 *  Framework-free: no React, no sessionStorage. Writing the seed across the route
 *  change stays with the caller (`briefSeedKey`). */
import type { BriefSeed } from "@/components/ai/KeywordResearch";
import type { ClusterArticle } from "./sample";
import type { ClusterStat } from "./compute";
import type { DecayingPost } from "./sample";

/** What we print for a keyword whose competition band we do not know. The brief
 *  tool already renders this case (KeywordResearch passes "" for a keyword typed
 *  outside the planner) — better an empty band than a fabricated one. */
const UNKNOWN_COMPETITION = "";

/** Brief seed from a cluster (optionally a specific article): the cluster topic is
 *  the primary keyword, the article/gap title is what to write.
 *
 *  The seed now carries the cluster's own keyword datum — its combined monthly
 *  search volume, which is the one real number the cluster view holds — so the
 *  brief is planned against the demand that made the cluster worth writing for.
 *  We do NOT invent per-article volumes: article titles are headlines, not measured
 *  keywords, and a fabricated volume would ground the model in fiction. */
export function seedFromCluster(cluster: ClusterStat, article?: ClusterArticle): BriefSeed {
  return {
    topic: article?.title ?? cluster.nextGap?.title ?? cluster.topic,
    primaryKeyword: cluster.topic,
    keywords: cluster.volume > 0
      ? [{ keyword: cluster.topic, volume: cluster.volume, competition: UNKNOWN_COMPETITION }]
      : [],
  };
}

/** Brief seed for refreshing a decaying post. Judgment call on keywords: a decay
 *  row carries a traffic TREND (YoY %, age) and no search-volume measurement at
 *  all, so there is no keyword datum to pass — anything here would be invented.
 *  The account's saved keywords still ground the brief; they are injected
 *  server-side by the /api/ai `brief` row, which is where real numbers live. */
export function seedFromDecay(post: DecayingPost): BriefSeed {
  return { topic: post.title, primaryKeyword: post.title, keywords: [] };
}
