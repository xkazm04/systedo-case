/** Brief seeds — the pure builders behind every "create content" entry point
 *  (src/lib/content-engine/seed.ts).
 *
 *  The kanály hop is the reason this file exists: the signpost had TWO doors into
 *  Tvorba and they disagreed — the drawer wrote a real seed, the row CTA pushed an
 *  empty engine, so the app told the maker exactly what to write and then forgot it
 *  one click later. Both doors now call `seedFromChannel`, so the seed is pinned
 *  once here rather than trusted twice in a component. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedFromChannel, seedFromCluster, seedFromDecay } from "@/lib/content-engine/seed";

// ── kanály → Tvorba (the one door) ─────────────────────────────────────────────

test("seedFromChannel: the angle is the topic, a real catalog keyword is the primary", () => {
  assert.deepEqual(
    seedFromChannel({
      contentAngle: "Jak vybrat autosedačku",
      fallbackTopic: "Blog: příspěvek pro Adamant",
      keywords: ["autosedačky", "kočárky"],
      projectName: "Adamant",
    }),
    { topic: "Jak vybrat autosedačku", primaryKeyword: "autosedačky", keywords: [] }
  );
});

test("seedFromChannel: no angle → the localized fallback topic", () => {
  const seed = seedFromChannel({
    contentAngle: "   ",
    fallbackTopic: "Blog: post for Adamant",
    keywords: ["car seats"],
    projectName: "Adamant",
  });
  assert.equal(seed.topic, "Blog: post for Adamant", "whitespace is not an angle");
  assert.equal(seed.primaryKeyword, "car seats");
});

test("seedFromChannel: an empty catalog falls back to the project name — never an empty keyword", () => {
  for (const keywords of [undefined, [], ["  "]]) {
    const seed = seedFromChannel({
      contentAngle: "A",
      fallbackTopic: "F",
      keywords,
      projectName: "Adamant",
    });
    assert.equal(seed.primaryKeyword, "Adamant", `keywords=${JSON.stringify(keywords)}`);
  }
});

test("seedFromChannel: both kanály doors produce the SAME seed for the same channel", () => {
  // The drawer and the row CTA differ only in which handler fires; both build the
  // seed from the identical inputs, so the seed must be indistinguishable.
  const args = {
    contentAngle: "Jak vybrat autosedačku",
    fallbackTopic: "F",
    keywords: ["autosedačky"],
    projectName: "Adamant",
  };
  assert.deepEqual(seedFromChannel(args), seedFromChannel({ ...args }));
  // …and it survives the sessionStorage bridge intact (JSON round-trip).
  assert.deepEqual(JSON.parse(JSON.stringify(seedFromChannel(args))), seedFromChannel(args));
});

// ── Tvorba's own rows ──────────────────────────────────────────────────────────

const cluster = (over = {}) => ({
  topic: "spánek miminka",
  volume: 4200,
  articles: [],
  published: 1,
  total: 2,
  coverage: 0.5,
  completeness: 0.5,
  hasPillar: true,
  nextGap: { title: "Spánkový regres", type: "supporting", status: "planned" },
  graph: { pillar: null, links: [], missingLinks: 0 },
  ...over,
});

test("seedFromCluster: carries the cluster's REAL combined volume as its keyword datum", () => {
  assert.deepEqual(seedFromCluster(cluster()), {
    topic: "Spánkový regres",
    primaryKeyword: "spánek miminka",
    keywords: [{ keyword: "spánek miminka", volume: 4200, competition: "" }],
  });
});

test("seedFromCluster: a named article is what to write; no volume → no invented keyword row", () => {
  const seed = seedFromCluster(cluster({ volume: 0 }), {
    title: "Bílý šum a spánek",
    type: "supporting",
    status: "planned",
  });
  assert.equal(seed.topic, "Bílý šum a spánek");
  assert.deepEqual(seed.keywords, [], "a zero-volume cluster grounds nothing rather than fabricating");
});

test("seedFromDecay: a decay row has a trend, not a volume — so it carries no keyword rows", () => {
  assert.deepEqual(seedFromDecay({ title: "Nejlepší kočárky 2024", monthsAgo: 14, trafficChangePct: -0.38 }), {
    topic: "Nejlepší kočárky 2024",
    primaryKeyword: "Nejlepší kočárky 2024",
    keywords: [],
  });
});
