/** Session revocation for the Account & Security module. NextAuth runs the
 *  database session strategy with the Firestore adapter, so a session is a doc in
 *  the "sessions" collection keyed by `userId` — revoking one is deleting its doc.
 *  Both helpers are best-effort (a count/revoke failure must never break the page
 *  or the sign-out), and no-op safely when Firestore is absent (local/dev). Both
 *  return `null` to mean "backend unavailable" — kept distinct from a legitimate
 *  `0` (no sessions / none revoked) so the UI can render "unavailable" and, for the
 *  security-critical revoke, never tell a user "0 revoked" when the batch actually
 *  failed and every other device is still signed in.
 *
 *  EXPIRY: a session doc is only deleted when the user explicitly signs out, or
 *  when that browser comes back with an expired token (NextAuth prunes it inside
 *  getSessionAndUser). A browser that is simply abandoned — cleared cookies, a
 *  wiped device, a one-off sign-in — leaves its doc behind FOREVER. Counting raw
 *  docs therefore drifts monotonically away from the truth, and the UI renders that
 *  number as "Aktivní relace / Active sessions". Both helpers filter on `expires`
 *  so the panel reports devices that can still act, not sign-in archaeology. */
import "server-only";
import { firestore } from "@/lib/firebase";

/** The @auth/firebase-adapter default sessions collection. */
const SESSIONS = "sessions";

/** Firestore caps a write batch at 500 ops; chunk deletes well under that. */
const BATCH_LIMIT = 450;

/** A session doc's `expires`, normalized to epoch millis, or `null` when it is
 *  missing/unparseable. These docs are read WITHOUT the adapter's converter (which
 *  is what turns a Timestamp into a Date), so the raw shape has to be handled here:
 *  a firebase-admin `Timestamp` in the normal case, a `Date` if a converter ever
 *  supplies one, and an ISO string / epoch number for a hand-written or legacy doc. */
export function sessionExpiryMs(raw: unknown): number | null {
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? null : ms;
  }
  // firebase-admin Timestamp — duck-typed so this module stays free of the SDK's
  // class identity (two copies of firebase-admin would fail an instanceof check).
  if (raw && typeof raw === "object") {
    const t = raw as { toMillis?: () => number; toDate?: () => Date };
    if (typeof t.toMillis === "function") {
      const ms = t.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof t.toDate === "function") {
      const ms = t.toDate().getTime();
      return Number.isFinite(ms) ? ms : null;
    }
  }
  return null;
}

/** Whether a session doc still counts as ACTIVE at `now`. An UNKNOWN expiry counts
 *  as active on purpose: for a security panel whose whole job is "where am I signed
 *  in?", hiding a session we failed to read is the worse of the two errors — an
 *  over-count is visible and dismissible, an under-count is a false all-clear. */
export function isActiveSession(rawExpires: unknown, now: number): boolean {
  const ms = sessionExpiryMs(rawExpires);
  return ms === null || ms > now;
}

/** Active (unexpired) session count for the user, or `null` if the backend read
 *  failed. Only `expires` is projected — the count never needs the session token,
 *  and not shipping it keeps a secret out of a page-render read path. */
export async function activeSessionCount(userId: string): Promise<number | null> {
  try {
    const snap = await firestore
      .collection(SESSIONS)
      .where("userId", "==", userId)
      .select("expires")
      .get();
    const now = Date.now();
    return snap.docs.filter((d) => isActiveSession(d.get("expires"), now)).length;
  } catch (err) {
    console.error(`[sessions] count failed for ${userId}:`, err);
    return null;
  }
}

/** Delete every session doc for the user ("sign out everywhere"). Returns how many
 *  ACTIVE sessions were revoked — the same number `activeSessionCount` reports, so
 *  the two can never contradict each other — or `null` if the operation failed (so
 *  the caller never reports a successful "0 revoked" for a failed
 *  sign-out-everywhere). Expired docs are deleted too (free cleanup of the archive
 *  nothing else prunes), they just don't inflate the reported figure. The caller
 *  still calls signOut() afterwards to clear the current session cookie. */
export async function revokeAllSessions(userId: string): Promise<number | null> {
  try {
    const snap = await firestore
      .collection(SESSIONS)
      .where("userId", "==", userId)
      .select("expires")
      .get();
    if (snap.empty) return 0;
    const now = Date.now();
    const revoked = snap.docs.filter((d) => isActiveSession(d.get("expires"), now)).length;
    // Commit in ≤BATCH_LIMIT chunks so a user with many sessions never trips the
    // 500-op batch cap (which would throw and revoke nothing).
    for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
      const batch = firestore.batch();
      for (const d of snap.docs.slice(i, i + BATCH_LIMIT)) batch.delete(d.ref);
      await batch.commit();
    }
    return revoked;
  } catch (err) {
    console.error(`[sessions] revokeAll failed for ${userId}:`, err);
    return null;
  }
}
