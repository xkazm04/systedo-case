/** KRAJINA's pure half (src/lib/leads/landscape.ts). The canvas is only as
 *  trustworthy as these four properties:
 *    • clustering agrees with the summary the module already renders,
 *    • the layout is DETERMINISTIC (same contact → same pixel, every render),
 *    • the caps disclose what they cost rather than silently dropping people,
 *    • a drill-down filter provably COVERS the selection it claims to open.
 *  Pure — no React, no store, no clock of its own. */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  LANDSCAPE_AXES,
  isLandscapeAxis,
  clusterKeyOf,
  buildClusters,
  clustersFromSummary,
  layoutClusters,
  focusLayout,
  layoutPoints,
  pointPosition,
  hash01,
  selectionQuery,
  OWNER_UNASSIGNED,
  POINT_CAP,
  MAX_AGE_DAYS,
  EXPAND_ZOOM,
} = await import("@/lib/leads/landscape");
const { summarizeContacts } = await import("@/lib/leads/summary");

const NOW = Date.parse("2026-08-22T12:00:00.000Z");
const iso = (daysAgo) => new Date(NOW - daysAgo * 86_400_000).toISOString();

const contact = (over = {}) => ({
  id: over.id ?? "c1",
  projectId: "p1",
  stage: "new",
  stageEnteredAt: iso(1),
  attribution: { source: "google-ads" },
  consent: [],
  tags: [],
  firstSeenAt: iso(1),
  lastActivityAt: iso(1),
  createdAt: iso(1),
  updatedAt: iso(1),
  ...over,
});

const SET = [
  contact({ id: "a", attribution: { source: "google-ads" }, stage: "new", firstSeenAt: iso(0.2) }),
  contact({ id: "b", attribution: { source: "google-ads" }, stage: "won", firstSeenAt: iso(40) }),
  contact({ id: "c", attribution: { source: "sklik" }, stage: "qualified", firstSeenAt: iso(9) }),
  contact({ id: "d", attribution: { source: "sklik" }, stage: "lost", firstSeenAt: iso(120) }),
  contact({ id: "e", attribution: { source: "referral" }, stage: "working", city: "Brno" }),
];

/* ── axes ────────────────────────────────────────────────────────────────────── */

test("axis guard accepts exactly the four axes", () => {
  assert.deepEqual([...LANDSCAPE_AXES], ["source", "stage", "region", "owner"]);
  for (const a of LANDSCAPE_AXES) assert.equal(isLandscapeAxis(a), true);
  assert.equal(isLandscapeAxis("grade"), false);
  assert.equal(isLandscapeAxis(null), false);
});

test("the region axis never invents a bucket for an unlocatable contact", () => {
  assert.equal(clusterKeyOf(contact(), "region"), null);
  assert.equal(clusterKeyOf(contact({ city: "Brno" }), "region"), "Brno");
  assert.equal(clusterKeyOf(contact({ postalCode: "602 00" }), "region"), "602xx");
});

test("owner falls back to one honest single-operator cluster", () => {
  assert.equal(clusterKeyOf(contact(), "owner"), OWNER_UNASSIGNED);
  assert.equal(clusterKeyOf(contact({ ownerId: "u9" }), "owner"), "u9");
});

/* ── clustering agrees with the summary ──────────────────────────────────────── */

test("server clusters and summary-seeded clusters describe the same counts", () => {
  const summary = summarizeContacts(SET, NOW, false);
  for (const axis of ["source", "stage"]) {
    const served = buildClusters(SET, axis, NOW);
    const seeded = clustersFromSummary(summary, axis);
    const norm = (s) =>
      s.clusters.map((c) => `${c.key}:${c.count}`).sort();
    assert.deepEqual(norm(served), norm(seeded), `axis ${axis} disagreed`);
  }
});

test("the summary cannot seed the owner axis — it says so instead of guessing", () => {
  const summary = summarizeContacts(SET, NOW, false);
  assert.equal(clustersFromSummary(summary, "owner"), null);
  assert.equal(clustersFromSummary(null, "source"), null);
});

test("cluster mix cross-tabs stage and SLA, and the parts sum to the whole", () => {
  const { clusters } = buildClusters(SET, "source", NOW);
  const google = clusters.find((c) => c.key === "Google Ads");
  assert.equal(google.count, 2);
  const stageTotal = Object.values(google.mix.byStage).reduce((n, v) => n + v, 0);
  const slaTotal = Object.values(google.mix.sla).reduce((n, v) => n + v, 0);
  assert.equal(stageTotal, google.count);
  assert.equal(slaTotal, google.count);
  // a won contact has left the queue: settled, never "breached forever"
  assert.equal(google.mix.byStage.won, 1);
});

test("the cluster cap discloses what it left off the canvas", () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    contact({ id: `x${i}`, attribution: { source: `src-${i}` } })
  );
  const set = buildClusters(many, "source", NOW, 5);
  assert.equal(set.clusters.length, 5);
  assert.equal(set.other.groups, 15);
  assert.equal(set.other.count, 15);
});

test("region clustering reports the contacts it could not place", () => {
  const set = buildClusters(SET, "region", NOW);
  assert.equal(set.unplaced, 4);
  assert.equal(set.clusters[0].key, "Brno");
});

/* ── deterministic geometry ──────────────────────────────────────────────────── */

test("hash01 is stable and in range", () => {
  assert.equal(hash01("abc"), hash01("abc"));
  assert.notEqual(hash01("abc"), hash01("abd"));
  for (const s of ["", "a", "Jan Novák", "c-42"]) {
    const h = hash01(s);
    assert.ok(h >= 0 && h < 1, `${s} → ${h}`);
  }
});

test("cluster layout is deterministic, non-overlapping and inside the box", () => {
  const box = { width: 1000, height: 620 };
  const { clusters } = buildClusters(SET, "source", NOW);
  const a = layoutClusters(clusters, box);
  const b = layoutClusters(clusters, box);
  assert.deepEqual(a, b);
  for (const c of a) {
    assert.ok(c.cx - c.r >= 0 && c.cx + c.r <= box.width, `${c.key} escaped horizontally`);
    assert.ok(c.cy - c.r >= 0 && c.cy + c.r <= box.height, `${c.key} escaped vertically`);
  }
  for (let i = 0; i < a.length; i += 1) {
    for (let j = i + 1; j < a.length; j += 1) {
      const d = Math.hypot(a[i].cx - a[j].cx, a[i].cy - a[j].cy);
      assert.ok(d >= a[i].r + a[j].r, `${a[i].key} overlaps ${a[j].key}`);
    }
  }
});

test("bigger clusters get bigger discs (area ∝ count)", () => {
  const rows = [
    { key: "big", count: 400 },
    { key: "small", count: 4 },
  ];
  const [big, small] = layoutClusters(rows, { width: 900, height: 600 });
  assert.ok(big.r > small.r);
});

test("disc size is absolute as well as relative — a tiny sample stays tiny", () => {
  const box = { width: 900, height: 600 };
  const small = layoutClusters([{ key: "a", count: 2 }], box);
  const large = layoutClusters([{ key: "a", count: 600 }], box);
  assert.ok(small[0].r < large[0].r / 2, "a 2-contact cluster drew like a busy pipeline");
  assert.ok(large[0].r <= Math.min(box.width, box.height) * 0.27);
});

test("focusLayout is semantic zoom: the focused disc grows, nothing else resizes", () => {
  const box = { width: 900, height: 600 };
  const base = layoutClusters(buildClusters(SET, "source", NOW).clusters, box);
  const key = base[0].key;
  assert.deepEqual(focusLayout(base, key, 0, box), base, "zoom 0 is the overview");
  assert.deepEqual(focusLayout(base, null, 1, box), base, "no focus is the overview");
  assert.deepEqual(focusLayout(base, "nope", 1, box), base, "an unknown key is total, not a throw");

  const zoomed = focusLayout(base, key, 1, box);
  const focus = zoomed.find((c) => c.key === key);
  assert.ok(focus.r > base[0].r);
  assert.equal(Math.round(focus.cx), box.width / 2);
  assert.equal(Math.round(focus.cy), box.height / 2);
  for (const c of zoomed) {
    if (c.key === key) continue;
    assert.equal(c.r, base.find((b) => b.key === c.key).r, "a neighbour was resized");
  }
  assert.ok(EXPAND_ZOOM > 0 && EXPAND_ZOOM < 1);
});

/* ── points ──────────────────────────────────────────────────────────────────── */

test("radial position encodes age: centre newest, rim oldest, unit disk", () => {
  const fresh = pointPosition("id", 0);
  const old = pointPosition("id", MAX_AGE_DAYS * 4);
  const rOf = (p) => Math.hypot(p.x, p.y);
  assert.ok(rOf(fresh) < rOf(old));
  assert.ok(rOf(old) <= 1);
  assert.deepEqual(pointPosition("id", 12), pointPosition("id", 12), "not deterministic");
  assert.notDeepEqual(pointPosition("id", 12), pointPosition("other", 12), "angles collapsed");
});

test("layoutPoints keeps the newest, caps the rest and discloses the overflow", () => {
  const many = Array.from({ length: 25 }, (_, i) => contact({ id: `p${i}`, firstSeenAt: iso(i) }));
  const { points, truncated } = layoutPoints(many, NOW, 10);
  assert.equal(points.length, 10);
  assert.equal(truncated, 15);
  assert.equal(points[0].id, "p0");
  assert.ok(points[0].ageDays <= points[9].ageDays);
  assert.ok(POINT_CAP >= 100);
});

test("an erased contact is never rendered as a person", () => {
  const { points } = layoutPoints(
    [contact({ id: "gone", name: "Jan Novák", erasedAt: iso(1) })],
    NOW
  );
  assert.equal(points[0].name, "");
});

test("SLA colour is the queue's phase, and a settled contact stays settled", () => {
  const breached = contact({ id: "b1", firstSeenAt: iso(2), slaDueAt: iso(2) });
  const answered = contact({ id: "b2", firstSeenAt: iso(2), slaDueAt: iso(2), firstRespondedAt: iso(1) });
  const closed = contact({ id: "b3", firstSeenAt: iso(2), slaDueAt: iso(2), stage: "lost" });
  const byId = Object.fromEntries(
    layoutPoints([breached, answered, closed], NOW).points.map((p) => [p.id, p.slaPhase])
  );
  assert.equal(byId.b1, "breached");
  assert.equal(byId.b2, "settled");
  assert.equal(byId.b3, "settled");
});

/* ── the drill-down promise ──────────────────────────────────────────────────── */

test("selectionQuery only offers a filter that provably covers the selection", () => {
  const p = (id, stage, name) => ({ id, stage, name, grade: null, slaPhase: "ontrack", ageDays: 1, x: 0, y: 0 });
  assert.equal(selectionQuery([]), null);
  assert.deepEqual(selectionQuery([p("1", "new", "Jan Novák")]), { search: "Jan Novák" });
  assert.equal(selectionQuery([p("1", "new", "")]), null, "a nameless single dot has no filter");
  assert.deepEqual(selectionQuery([p("1", "new", "A"), p("2", "new", "B")]), { stage: "new" });
  assert.equal(
    selectionQuery([p("1", "new", "A"), p("2", "won", "B")]),
    null,
    "a mixed-stage selection must disable the drill, not open the wrong table"
  );
});
