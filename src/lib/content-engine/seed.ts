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

/** Brief seed for an organic channel's next piece (kanály → Tvorba).
 *
 *  There are TWO doors from the signpost — the channel drawer's "create content"
 *  and the row CTA's derived next step — and they had drifted: one wrote a real
 *  seed, the other pushed to the engine with nothing, landing the maker in a blank
 *  workspace one click after the app told them exactly what to write. Both now
 *  build the seed HERE, so the door taken cannot change what arrives.
 *
 *  `primaryKeyword` prefers a real catalog keyword the page already resolved into
 *  its grounding: a brand name is not an SEO keyword, it is only the last resort
 *  for a project with an empty catalog. */
export function seedFromChannel(args: {
  /** the channel's content angle, when the plan proposed one */
  contentAngle?: string;
  /** localized fallback topic ("{channel}: příspěvek pro {brand}") when it did not */
  fallbackTopic: string;
  /** the project's resolved catalog keywords, best first */
  keywords?: string[];
  /** last-resort primary keyword (the project name) */
  projectName: string;
}): BriefSeed {
  return {
    topic: args.contentAngle?.trim() || args.fallbackTopic,
    primaryKeyword: args.keywords?.[0]?.trim() || args.projectName,
    // No keyword rows: a channel plan carries an angle, not search-volume data.
    // The account's saved keywords ground the brief server-side (the /api/ai brief
    // row) — that is where measured numbers live.
    keywords: [],
  };
}
