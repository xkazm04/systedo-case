/** Unit tests for the content-engine cluster helpers (findings #3 + #4):
 *  - completeness() weights a published pillar above a published supporting page,
 *  - nextGap() prefers a missing pillar over supporting articles,
 *  - rankedClusterStats() orders least-complete first,
 *  - clusterLinkGraph().missingLinks counts published spokes without a live link. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completeness,
  nextGap,
  clusterLinkGraph,
  clusterStats,
  rankedClusterStats,
  PILLAR_WEIGHT,
  SUPPORTING_WEIGHT,
} from "@/lib/content-engine/compute";

const pillar = (status, linksToPillar) => ({ title: "Pilíř", type: "pillar", status, linksToPillar });
const support = (title, status, linksToPillar) => ({ title, type: "supporting", status, linksToPillar });

/** A cluster with a published pillar + two supporting (one published) is more
 *  complete than the same set with the pillar still planned. */
test("completeness weights a published pillar above supporting pages", () => {
  const withPillar = {
    topic: "t",
    volume: 100,
    articles: [pillar("published"), support("a", "published"), support("b", "planned")],
  };
  const withoutPillar = {
    topic: "t",
    volume: 100,
    articles: [pillar("planned"), support("a", "published"), support("b", "planned")],
  };
  // published weight = pillar(3) + supporting(1) = 4; total = 3 + 1 + 1 = 5
  assert.equal(completeness(withPillar), 4 / 5);
  // only one supporting published → 1 / 5
  assert.equal(completeness(withoutPillar), SUPPORTING_WEIGHT / 5);
  assert.ok(completeness(withPillar) > completeness(withoutPillar));
  assert.ok(PILLAR_WEIGHT > SUPPORTING_WEIGHT);
});

test("completeness is 0 for an empty cluster and 1 when everything is published", () => {
  assert.equal(completeness({ topic: "t", volume: 0, articles: [] }), 0);
  const full = {
    topic: "t",
    volume: 1,
    articles: [pillar("published"), support("a", "published")],
  };
  assert.equal(completeness(full), 1);
});

test("nextGap prefers a planned pillar over any supporting gap", () => {
  const c = {
    topic: "t",
    volume: 100,
    articles: [pillar("planned"), support("a", "planned"), support("b", "published")],
  };
  const gap = nextGap(c);
  assert.equal(gap.type, "pillar");
});

test("nextGap falls back to the first planned supporting when the pillar exists", () => {
  const c = {
    topic: "t",
    volume: 100,
    articles: [pillar("published"), support("a", "planned"), support("b", "planned")],
  };
  const gap = nextGap(c);
  assert.equal(gap.type, "supporting");
  assert.equal(gap.title, "a");
});

test("nextGap is null when nothing is planned", () => {
  const c = {
    topic: "t",
    volume: 100,
    articles: [pillar("published"), support("a", "published")],
  };
  assert.equal(nextGap(c), null);
});

test("clusterLinkGraph.missingLinks counts published spokes without a live link", () => {
  const c = {
    topic: "t",
    volume: 100,
    articles: [
      pillar("published"),
      support("wired", "published", true), // linked
      support("orphan", "published", false), // published but missing link → debt
      support("orphan2", "published"), // published, flag undefined → debt
      support("draft", "planned", false), // not published → not counted
    ],
  };
  const g = clusterLinkGraph(c);
  assert.equal(g.missingLinks, 2);
  assert.equal(g.pillar.title, "Pilíř");
  // one linked spoke, three with no live link, total four supporting spokes
  assert.equal(g.links.length, 4);
  assert.equal(g.links.filter((l) => l.linked).length, 1);
});

test("clusterLinkGraph: an unpublished pillar means no link can be live and no link-debt is countable", () => {
  const c = {
    topic: "t",
    volume: 100,
    articles: [
      pillar("planned"), // pillar not published → no live link is possible yet
      support("a", "published", true),
      support("b", "planned", true),
    ],
  };
  const g = clusterLinkGraph(c);
  // No published hub to link to → this is pillar debt (flagged separately), not
  // link debt, so missingLinks stays 0; nothing can be a live link.
  assert.equal(g.missingLinks, 0);
  assert.ok(g.links.every((l) => l.linked === false));
});

test("clusterStats exposes completeness, hasPillar, nextGap and graph together", () => {
  const c = {
    topic: "t",
    volume: 100,
    articles: [support("a", "published", false), support("b", "planned")],
  };
  const s = clusterStats(c);
  assert.equal(s.hasPillar, false);
  assert.equal(s.graph.pillar, null);
  assert.equal(s.nextGap.title, "b");
  // 1 supporting published of 2 supporting → 1/2
  assert.equal(s.completeness, 0.5);
});

test("rankedClusterStats orders least-complete first, breaking ties on volume", () => {
  const a = { topic: "a", volume: 100, articles: [pillar("published")] }; // completeness 1
  const b = { topic: "b", volume: 100, articles: [pillar("planned")] }; // completeness 0
  const c = { topic: "c", volume: 500, articles: [pillar("planned")] }; // completeness 0, bigger
  const ranked = rankedClusterStats([a, b, c]);
  assert.deepEqual(
    ranked.map((r) => r.topic),
    ["c", "b", "a"],
  );
});
