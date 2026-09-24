/** The "Needs attention" triage inbox's pure core (src/lib/advice/triage.ts).
 *
 *  The advice ledger already records a dismiss/undo verdict per subject and the PATCH
 *  route behind it is proved in advice-store-route.test.mjs. What this suite pins is the
 *  CLIENT half that makes the verdict reachable: which rows the feed shows, the exact
 *  request a verdict sends, and the optimistic state machine that must never lose a row
 *  silently (a failed write returns the row WITH a named notice) nor resurrect one (a
 *  refresh during an in-flight verdict keeps it hidden). Storeless, no I/O. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);
const {
  partitionFeed,
  adviceStatusRequest,
  actionStatus,
  triageReducer,
  reconcile,
  isHidden,
  canUndo,
  repeatHint,
} = await import("@/lib/advice/triage");

const T = "2026-09-20T10:00:00.000Z";
const rec = (key, title = key.toUpperCase()) => ({ id: `r-${key}`, subjectKey: key, title });
const record = (key, extra) => ({
  subjectKey: key,
  module: "m",
  severity: "warning",
  title: key.toUpperCase(),
  firstSeenAt: "2026-09-01T00:00:00.000Z",
  lastSeenAt: T,
  timesSeen: 2,
  reopenedCount: 0,
  status: "open",
  ...extra,
});

test("partitionFeed hides a dismissed subject, keeps order, and counts the badge without it", () => {
  const [a, b, c] = [rec("a"), rec("b"), rec("c")];
  const ledger = {
    records: [record("a"), record("b", { status: "dismissed", dismissedAt: T, title: "B" })],
    updatedAt: T,
  };
  const feed = partitionFeed([a, b, c], ledger);
  assert.deepEqual(feed.visible, [a, c]);
  assert.deepEqual(feed.dismissed, [{ subjectKey: "b", title: "B", dismissedAt: T }]);
  assert.equal(feed.badge, 2);
  assert.equal(feed.canTriage, true);
});

test("partitionFeed with no ledger renders today's feed and offers no verdict control", () => {
  const recs = [rec("a"), rec("b")];
  const feed = partitionFeed(recs, null);
  assert.equal(feed.visible, recs);
  assert.deepEqual(feed.dismissed, []);
  assert.equal(feed.badge, 2);
  assert.equal(feed.canTriage, false);
});

test("adviceStatusRequest is the existing PATCH route's exact wire shape", () => {
  assert.deepEqual(adviceStatusRequest("p 1", "lokalni:coverage-gap:beleni-zubu|praha", "dismissed"), {
    url: "/api/projects/p%201/advice",
    init: {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: '{"subjectKey":"lokalni:coverage-gap:beleni-zubu|praha","status":"dismissed"}',
    },
  });
});

test("a dismiss hides optimistically; a 500 returns the row WITH a named notice", () => {
  const pending = triageReducer({}, { type: "dismiss", key: "a" });
  assert.equal(isHidden(pending, "a"), true);
  const failed = triageReducer(pending, { type: "settled", key: "a", httpStatus: 500 });
  assert.equal(isHidden(failed, "a"), false);
  assert.deepEqual(failed.error, { key: "a", kind: "failed" });
});

test("a 404 is 'untracked' (retry later), a 200 settles dismissed and undoable", () => {
  const pending = triageReducer({}, { type: "dismiss", key: "a" });
  const untracked = triageReducer(pending, { type: "settled", key: "a", httpStatus: 404 });
  assert.equal(untracked.error?.kind, "untracked");
  assert.equal(isHidden(untracked, "a"), false);
  const ok = triageReducer(pending, { type: "settled", key: "a", httpStatus: 200 });
  assert.equal(ok.a, "dismissed");
  assert.equal(canUndo(ok, "a"), true);
  assert.equal(ok.error ?? null, null);
});

test("undo on a dismissed row is pending-restore and sends status 'open'", () => {
  const dismissed = triageReducer(triageReducer({}, { type: "dismiss", key: "a" }), {
    type: "settled",
    key: "a",
    httpStatus: 200,
  });
  const action = { type: "undo", key: "a" };
  const restoring = triageReducer(dismissed, action);
  assert.equal(restoring.a, "pending-restore");
  assert.equal(isHidden(restoring, "a"), false);
  const { init } = adviceStatusRequest("p1", "a", actionStatus(action));
  assert.equal(JSON.parse(init.body).status, "open");
  assert.equal(actionStatus({ type: "dismiss", key: "a" }), "dismissed");
  // a failed restore goes back to hidden, again with a notice
  const back = triageReducer(restoring, { type: "settled", key: "a", httpStatus: 500 });
  assert.equal(isHidden(back, "a"), true);
  assert.deepEqual(back.error, { key: "a", kind: "failed" });
});

test("a refresh during an in-flight verdict does not resurrect the row", () => {
  const pending = triageReducer({}, { type: "dismiss", key: "a" });
  const after = reconcile(pending, ["a", "c"]);
  assert.equal(isHidden(after, "a"), true);
  // once the server agrees with a settled restore, the client entry is dropped
  const restored = { a: "open" };
  assert.equal("a" in reconcile(restored, ["a", "c"]), false);
});

test("repeatHint surfaces advice shown many times, and nothing for a fresh or untracked one", () => {
  const now = new Date("2026-09-24T00:00:00Z");
  assert.deepEqual(repeatHint({ timesSeen: 11, firstSeenAt: "2026-09-01T00:00:00Z" }, now), {
    times: 11,
    days: 23,
  });
  assert.equal(repeatHint({ timesSeen: 3, firstSeenAt: "2026-09-01T00:00:00Z" }, now), null);
  assert.equal(repeatHint(null, now), null);
});
