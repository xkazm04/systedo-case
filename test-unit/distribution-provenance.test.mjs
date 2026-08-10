/** Unit tests for Distribuce's PER-PANEL provenance (src/lib/distribution/provenance.ts).
 *
 *  The bug this pins: the page derived ModulePage's blanket `sample` gutter from
 *  whether the project had handed any article of its own over, while the
 *  attribution table and the Insights rollup over it kept rendering a fixture. One
 *  handed-over article turned the page's claim from "all illustrative" to "not
 *  illustrative" over two panels that are fixture by construction.
 *
 *  Runs the TS source directly via the shared resolve hook
 *  (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  panelProvenance,
  pageSampleGutter,
  isProvenanceCoherent,
} from "@/lib/distribution/provenance";

test("a fresh project: everything is illustrative and the blanket gutter is allowed", () => {
  const panels = panelProvenance({ sourceOrigin: "sample" });
  assert.deepEqual(panels, { source: true, variants: true, attribution: true, learnings: true });
  assert.equal(pageSampleGutter(false), true);
  assert.ok(isProvenanceCoherent(pageSampleGutter(false), panels));
});

test("THE REGRESSION: one handed-over article drops the gutter but never the fixture panels", () => {
  const panels = panelProvenance({ sourceOrigin: "project" });
  // the user's own article and the variants repurposed from it are not sample…
  assert.equal(panels.source, false);
  assert.equal(panels.variants, false);
  // …but the attribution and the insights rolled up from it still are, and say so
  // exactly when the page-level gutter stops speaking for them.
  assert.equal(panels.attribution, true);
  assert.equal(panels.learnings, true);
  assert.equal(pageSampleGutter(true), false);
  assert.ok(isProvenanceCoherent(pageSampleGutter(true), panels));
});

test("the blanket gutter is never shown over a panel that is NOT illustrative", () => {
  // The incoherent combination the old page could produce if the gutter were
  // pinned on: a real article underneath an "everything here is sample" banner.
  assert.equal(isProvenanceCoherent(true, panelProvenance({ sourceOrigin: "project" })), false);
});

test("variants inherit the source's origin — a real article never yields sample variants", () => {
  for (const origin of ["sample", "project"]) {
    const p = panelProvenance({ sourceOrigin: origin });
    assert.equal(p.variants, p.source, `${origin}: variants must follow their source`);
  }
});

test("insights can never be more trustworthy than the attribution they roll up", () => {
  for (const attributionLive of [false, true]) {
    const p = panelProvenance({ sourceOrigin: "sample", attributionLive });
    assert.equal(p.learnings, p.attribution, "the rollup must follow its input");
  }
});

test("the analytics seam fails CLOSED — omitted liveness discloses", () => {
  assert.equal(panelProvenance({ sourceOrigin: "project" }).attribution, true);
  assert.equal(panelProvenance({ sourceOrigin: "project", attributionLive: undefined }).attribution, true);
  // and when the seam does land, both panels stop disclosing together
  const live = panelProvenance({ sourceOrigin: "project", attributionLive: true });
  assert.deepEqual(live, { source: false, variants: false, attribution: false, learnings: false });
  // …at which point the blanket gutter is still correctly withheld
  assert.ok(isProvenanceCoherent(pageSampleGutter(true), live));
});

test("a project on live analytics but still on the fixture ARTICLE discloses only the article", () => {
  const p = panelProvenance({ sourceOrigin: "sample", attributionLive: true });
  assert.deepEqual(p, { source: true, variants: true, attribution: false, learnings: false });
  // mixed provenance means the blanket claim is unavailable in BOTH directions
  assert.equal(isProvenanceCoherent(true, p), false);
});
