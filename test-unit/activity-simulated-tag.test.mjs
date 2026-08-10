/** The simulated-publish tag on the Activity timeline (src/lib/activity/compute.ts:
 *  recordToEvent + activityCsvRows).
 *
 *  The bug being fenced: the `publishSimulated` tag is stored on the activity row
 *  (campaigns/activity.ts), written at publish time (activity/publish.ts) and split
 *  out by the publish-rate rollup (publish-rate-live.ts) — but recordToEvent DROPPED
 *  it, so a simulated send and a real one rendered as identical rows in the timeline
 *  an agency uses to explain account changes to a client.
 *
 *  Legacy posture pinned here too: an untagged row is REAL, matching the rollup —
 *  the two surfaces must never disagree about the same event. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { activityCsvRows, recordToEvent } from "@/lib/activity/compute";

const NOW = Date.parse("2026-08-10T00:00:00.000Z");

const publishRow = (over = {}) => ({
  id: "r1",
  kind: "update",
  title: "Příspěvek publikován",
  detail: "LinkedIn",
  module: "obsah-plan",
  severity: "success",
  at: "2026-08-09T00:00:00.000Z",
  publishKind: "social_post",
  publishVia: "channel",
  ...over,
});

test("recordToEvent carries the simulated tag onto the event", () => {
  const e = recordToEvent(publishRow({ publishSimulated: true }), NOW);
  assert.equal(e.simulated, true);
});

test("an untagged (legacy) publish row reads as REAL, like the rollup counts it", () => {
  assert.equal(recordToEvent(publishRow(), NOW).simulated, undefined);
  assert.equal(recordToEvent(publishRow({ publishSimulated: false }), NOW).simulated, undefined);
});

test("a non-publish row is never marked simulated", () => {
  const e = recordToEvent(
    { id: "r2", kind: "sync", title: "Synchronizace", detail: "", at: "2026-08-09T00:00:00.000Z" },
    NOW
  );
  assert.equal(e.simulated, undefined);
});

test("the tag does not disturb the rest of the mapping", () => {
  const e = recordToEvent(publishRow({ publishSimulated: true, actor: "Vy" }), NOW);
  assert.equal(e.module, "obsah-plan");
  assert.equal(e.severity, "success");
  assert.equal(e.actor, "you");
  assert.equal(e.daysAgo, 1);
  assert.equal(e.text, "Příspěvek publikován — LinkedIn");
});

test("the CSV export carries the tag in its own column — and only for simulated rows", () => {
  const labels = {
    when: (d) => `${d}d`,
    module: (m) => m.toUpperCase(),
    severity: (s) => s,
    title: (e) => e.text ?? e.tmpl,
    simulated: "Simulované publikování",
  };
  const rows = activityCsvRows(
    [
      recordToEvent(publishRow({ id: "sim", publishSimulated: true }), NOW),
      recordToEvent(publishRow({ id: "real" }), NOW),
    ],
    labels
  );
  assert.deepEqual(rows, [
    ["1d", "OBSAH-PLAN", "success", "Příspěvek publikován — LinkedIn", "Simulované publikování"],
    ["1d", "OBSAH-PLAN", "success", "Příspěvek publikován — LinkedIn", ""],
  ]);
});
