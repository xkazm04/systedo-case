/** The additive `source` filter on ContactQuery — the server-side half of the
 *  segment map's drill-down ("this source, this stage, open it in the table").
 *  It matches the DERIVED display label, because that is what every aggregate in
 *  the module groups by. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { applyContactQuery } = await import("@/lib/leads/store-filter");

function contact(id, source, campaign) {
  return {
    id,
    projectId: "p1",
    name: `Contact ${id}`,
    stage: "new",
    stageEnteredAt: "2026-08-01T00:00:00.000Z",
    attribution: { source, ...(campaign ? { campaign } : {}) },
    consent: [],
    tags: [],
    firstSeenAt: "2026-08-01T00:00:00.000Z",
    lastActivityAt: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

const ROWS = [
  contact("a", "google-ads", "Brand"),
  contact("b", "google-ads"),
  contact("c", "sklik"),
];

test("filtering by source uses the display label the aggregates group by", () => {
  assert.deepEqual(
    applyContactQuery(ROWS, { source: "Google Ads" }).map((c) => c.id),
    ["b"],
    "a campaign-suffixed label is its OWN row and must not be swept in"
  );
  assert.deepEqual(applyContactQuery(ROWS, { source: "Google Ads – Brand" }).map((c) => c.id), ["a"]);
  assert.deepEqual(applyContactQuery(ROWS, { source: "Sklik" }).map((c) => c.id), ["c"]);
});

test("no source filter changes nothing, and an unknown source matches nothing", () => {
  assert.equal(applyContactQuery(ROWS, {}).length, 3);
  assert.equal(applyContactQuery(ROWS, { source: "   " }).length, 3, "blank is not a filter");
  assert.equal(applyContactQuery(ROWS, { source: "Meta" }).length, 0);
});

test("the source filter composes with search instead of replacing it", () => {
  assert.deepEqual(
    applyContactQuery(ROWS, { source: "Google Ads", search: "contact b" }).map((c) => c.id),
    ["b"]
  );
  assert.equal(applyContactQuery(ROWS, { source: "Sklik", search: "contact b" }).length, 0);
});
