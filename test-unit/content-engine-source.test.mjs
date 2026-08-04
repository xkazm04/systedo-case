/** The content engine's data-source seam: the source label must follow what the
 *  rendered numbers were DERIVED from, never whether the project happens to have a
 *  live connection somewhere else in the app. Regression guard for "Živá data ·
 *  Google Ads" being stamped over procedurally-varied fixtures. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveContentDataset } from "@/lib/content-engine/resolve";
import { clustersForProject, SAMPLE_DECAY } from "@/lib/content-engine/sample";
import { storedSources, upsertSource } from "@/lib/distribution/variants";

const project = { id: "p-synced", name: "Synced", type: "content" };

test("a project with synced Ads data is NOT labelled live while it renders fixture clusters", () => {
  const data = resolveContentDataset(project, { adsSynced: true });
  assert.equal(data.live, false);
  assert.equal(data.derivedFrom, "sample");
  // …and it really is the fixture that renders, which is the whole point.
  assert.deepEqual(data.clusters, clustersForProject(project));
  assert.deepEqual(data.decay, SAMPLE_DECAY);
});

test("the Ads sync signal is carried through as a caveat, not as liveness", () => {
  assert.equal(resolveContentDataset(project, { adsSynced: true }).adsSynced, true);
  assert.equal(resolveContentDataset(project).adsSynced, false);
  assert.equal(resolveContentDataset(project, { adsSynced: false }).adsSynced, false);
});

test("an unsynced project still gets the module, labelled sample", () => {
  const data = resolveContentDataset(project, { adsSynced: false });
  assert.equal(data.live, false);
  assert.ok(data.clusters.length > 0, "the module is labelled honestly, never hidden");
});

test("live is derived from the derivation, so both flip together", () => {
  const data = resolveContentDataset(project, { adsSynced: true });
  assert.equal(data.live, data.derivedFrom !== "sample");
});

/** The sibling half of the same rule: Distribuce's page-level sample banner is
 *  `!storedSources(...).length`, so it stops contradicting the in-card origin pill
 *  once the user has handed a real article over. */
test("distribuce's page-level sample flag follows the stored sources", () => {
  assert.equal(storedSources(null).length > 0, false);
  assert.equal(storedSources({ articles: [], updatedAt: "" }).length > 0, false);
  const withSource = upsertSource(null, {
    articleKey: "a1",
    title: "Můj článek",
    url: "https://example.com/a",
    body: "",
    savedAt: new Date().toISOString(),
  });
  assert.equal(storedSources(withSource).length > 0, true);
});
