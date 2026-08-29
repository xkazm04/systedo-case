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
  attributionIsLive,
} from "@/lib/distribution/provenance";
import { measuredAttribution } from "@/lib/distribution/measured";

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

/* ── WP W2-A: the seam that was hypothetical is now the /go outcome ledger ───── */

const outcome = (channel, clicks30d, links = 1) => ({
  channel,
  links,
  clicks7d: 0,
  clicks30d,
  lastClickAt: clicks30d > 0 ? "2026-08-29" : undefined,
});

test("attributionIsLive: one counted click is the bar, a minted link is not", () => {
  assert.equal(attributionIsLive(undefined), false, "nothing measured fails closed");
  assert.equal(attributionIsLive([]), false);
  assert.equal(
    attributionIsLive([outcome("LinkedIn", 0, 4)]),
    false,
    "four minted links and no clicks is setup, not measurement"
  );
  assert.equal(attributionIsLive([outcome("LinkedIn", 0, 4), outcome("Newsletter", 1)]), true);
});

test("THE FLIP: measured clicks turn both bottom panels live, and the sample path is unchanged", () => {
  const live = panelProvenance({
    sourceOrigin: "sample",
    attributionLive: attributionIsLive([outcome("LinkedIn", 3)]),
  });
  assert.equal(live.attribution, false, "the table is now measurement, not a fixture");
  assert.equal(live.learnings, false, "and the rollup over it follows, as it always must");

  // Byte-identical to the pre-W2-A behaviour for everyone with nothing measured.
  const nothing = panelProvenance({
    sourceOrigin: "sample",
    attributionLive: attributionIsLive([outcome("LinkedIn", 0, 2)]),
  });
  assert.deepEqual(nothing, { source: true, variants: true, attribution: true, learnings: true });
});

test("the blanket gutter answers to the measured half too (it would otherwise over-claim)", () => {
  // Fixture article + measured clicks: the page must NOT say "everything here is
  // illustrative", and isProvenanceCoherent is what proves it would have been a lie.
  const panels = panelProvenance({ sourceOrigin: "sample", attributionLive: true });
  assert.equal(pageSampleGutter(false, true), false);
  assert.ok(isProvenanceCoherent(pageSampleGutter(false, true), panels));
  assert.equal(isProvenanceCoherent(true, panels), false, "the old gutter here was an over-claim");
  // …and with nothing measured the gutter behaves exactly as before.
  assert.equal(pageSampleGutter(false), true);
  assert.equal(pageSampleGutter(false, false), true);
  assert.equal(pageSampleGutter(true, false), false);
});

test("measuredAttribution: only clicked channels become rows, reach carries LINKS", () => {
  const rows = measuredAttribution([outcome("LinkedIn", 12, 3), outcome("Reddit", 0, 5)]);
  assert.deepEqual(rows, [{ channel: "LinkedIn", reach: 3, clicks: 12 }]);
  assert.deepEqual(measuredAttribution([]), []);
});
