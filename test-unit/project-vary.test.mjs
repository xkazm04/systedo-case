/** Unit tests for the per-project data variation (src/lib/project-data/vary.ts
 *  and the module derive functions). Two projects must show different numbers,
 *  the same project must be stable, and — critically — uniform scaling must never
 *  break a fixture's invariants (funnel ordering, segment sums, winner ranking). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectVary } from "@/lib/project-data/vary";
import { sourcesForProject } from "@/lib/lead-quality/sample";
import { audienceForProject } from "@/lib/audience/sample";
import { experimentsForProject } from "@/lib/lp-exp/sample";

const project = (id, type = "eshop") => ({ id, name: `Proj ${id}`, type, accentColor: "#000", domain: null });
const A = project("proj-aaaa");
const B = project("proj-bbbb");

test("projectVary is deterministic per project and differs across projects", () => {
  const a1 = projectVary(A, "m");
  const a2 = projectVary(A, "m");
  assert.equal(a1.magnitude, a2.magnitude, "same project+label → identical magnitude");
  assert.equal(a1.int(1000), a2.int(1000), "same project+label → identical scaling");
  assert.notEqual(projectVary(A, "m").magnitude, projectVary(B, "m").magnitude, "different ids differ");
  // Different module labels for the same project don't move in lockstep.
  assert.notEqual(projectVary(A, "m1").magnitude, projectVary(A, "m2").magnitude);
});

test("lead sources differ per project but preserve the funnel ordering", () => {
  const a = sourcesForProject(A);
  const b = sourcesForProject(B);
  assert.notEqual(a[0].leads, b[0].leads, "two projects show different lead volumes");
  for (const s of [...a, ...b]) {
    assert.ok(s.leads >= s.qualified, `leads ≥ qualified (${s.source})`);
    if (s.opportunities !== undefined) {
      assert.ok(s.qualified >= s.opportunities, `qualified ≥ opportunities (${s.source})`);
      assert.ok(s.opportunities >= s.won, `opportunities ≥ won (${s.source})`);
    } else {
      assert.ok(s.qualified >= s.won, `qualified ≥ won (${s.source})`);
    }
  }
});

test("lead-source rates are preserved by uniform scaling (only magnitudes change)", () => {
  const a = sourcesForProject(A);
  const b = sourcesForProject(B);
  // Win rate won/leads is a ratio → identical across projects under uniform scale
  // (within rounding on these magnitudes).
  const rateA = a[0].won / a[0].leads;
  const rateB = b[0].won / b[0].leads;
  assert.ok(Math.abs(rateA - rateB) < 0.02, "win rate stable across projects");
});

test("audience segments always sum to the funnel subscriber total", () => {
  for (const p of [A, B]) {
    const d = audienceForProject(p);
    const sum = d.segments.reduce((s, seg) => s + seg.subscribers, 0);
    assert.equal(sum, d.funnel.subscribers, "segment subscribers sum to funnel total");
    assert.ok(d.funnel.activeSubscribers <= d.funnel.subscribers, "active ≤ total");
    assert.ok(d.funnel.visitors >= d.funnel.subscribers, "visitors ≥ subscribers");
  }
  assert.notEqual(audienceForProject(A).funnel.visitors, audienceForProject(B).funnel.visitors);
});

test("LP experiment winner is unchanged by per-project scaling", () => {
  const winnerCvr = (exp) =>
    exp.variants
      .map((v) => ({ label: v.label, cvr: v.signups / v.visitors }))
      .sort((x, y) => y.cvr - x.cvr)[0].label;
  const base = experimentsForProject(A);
  const other = experimentsForProject(B);
  for (let i = 0; i < base.length; i++) {
    assert.equal(winnerCvr(base[i]), winnerCvr(other[i]), `same winning variant in ${base[i].id}`);
  }
});
