/** Session expiry classification for Account & Security (src/lib/account/sessions.ts).
 *
 *  The "Aktivní relace / Active sessions" figure used to be `snap.size` — every
 *  session doc the Firestore adapter ever wrote for the user. Nothing prunes an
 *  abandoned browser's doc (NextAuth only deletes on an explicit sign-out, or when
 *  THAT browser returns with a dead token), so the number drifted upward forever
 *  and a "sign out everywhere" reported revoking sessions that had been dead for
 *  months. These pin the classification the count now runs on, including the
 *  deliberate fail-open on an unreadable `expires`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionExpiryMs, isActiveSession } from "@/lib/account/sessions";

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);
/** Stand-in for a firebase-admin Timestamp: duck-typed, never the real class. */
const timestamp = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });

test("sessionExpiryMs reads every shape a raw session doc can carry", () => {
  assert.equal(sessionExpiryMs(timestamp(NOW)), NOW, "firebase-admin Timestamp");
  assert.equal(sessionExpiryMs({ toDate: () => new Date(NOW) }), NOW, "Timestamp without toMillis");
  assert.equal(sessionExpiryMs(new Date(NOW)), NOW, "Date (converter-supplied)");
  assert.equal(sessionExpiryMs(NOW), NOW, "epoch millis");
  assert.equal(sessionExpiryMs("2026-08-05T12:00:00.000Z"), NOW, "ISO string (legacy doc)");
});

test("sessionExpiryMs returns null for anything it cannot read", () => {
  for (const bad of [undefined, null, "", "not-a-date", {}, [], NaN, { toMillis: () => NaN }]) {
    assert.equal(sessionExpiryMs(bad), null, `unreadable: ${JSON.stringify(bad)}`);
  }
});

test("a session is active only while its expiry is still ahead of now", () => {
  assert.equal(isActiveSession(timestamp(NOW + 1000), NOW), true, "future expiry → active");
  assert.equal(isActiveSession(timestamp(NOW - 1000), NOW), false, "past expiry → expired");
  // Exactly at the boundary the session is over — `expires` is the instant it dies.
  assert.equal(isActiveSession(timestamp(NOW), NOW), false, "expiry == now → expired");
});

test("an unreadable expiry counts as ACTIVE (never a false all-clear)", () => {
  // Under-counting is the dangerous direction: a security panel that hides a
  // session it failed to parse tells the user "nobody else is signed in".
  assert.equal(isActiveSession(undefined, NOW), true);
  assert.equal(isActiveSession("garbage", NOW), true);
});

test("the stale-doc archive is what the old count was really reporting", () => {
  // One live browser plus three abandoned sign-ins from months ago: the panel must
  // say 1, not 4.
  const docs = [
    timestamp(NOW + 30 * 86_400_000),
    timestamp(NOW - 200 * 86_400_000),
    timestamp(NOW - 90 * 86_400_000),
    timestamp(NOW - 1),
  ];
  assert.equal(docs.filter((d) => isActiveSession(d, NOW)).length, 1);
});
