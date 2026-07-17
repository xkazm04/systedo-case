/** Session revocation for the Account & Security module. NextAuth runs the
 *  database session strategy with the Firestore adapter, so a session is a doc in
 *  the "sessions" collection keyed by `userId` — revoking one is deleting its doc.
 *  Both helpers are best-effort (a count/revoke failure must never break the page
 *  or the sign-out), and no-op safely when Firestore is absent (local/dev). Both
 *  return `null` to mean "backend unavailable" — kept distinct from a legitimate
 *  `0` (no sessions / none revoked) so the UI can render "unavailable" and, for the
 *  security-critical revoke, never tell a user "0 revoked" when the batch actually
 *  failed and every other device is still signed in. */
import "server-only";
import { firestore } from "@/lib/firebase";

/** The @auth/firebase-adapter default sessions collection. */
const SESSIONS = "sessions";

/** Firestore caps a write batch at 500 ops; chunk deletes well under that. */
const BATCH_LIMIT = 450;

/** Active session count for the user, or `null` if the backend read failed. */
export async function activeSessionCount(userId: string): Promise<number | null> {
  try {
    const snap = await firestore.collection(SESSIONS).where("userId", "==", userId).get();
    return snap.size;
  } catch (err) {
    console.error(`[sessions] count failed for ${userId}:`, err);
    return null;
  }
}

/** Delete every session doc for the user ("sign out everywhere"). Returns how many
 *  were revoked, or `null` if the operation failed (so the caller never reports a
 *  successful "0 revoked" for a failed sign-out-everywhere). The caller still calls
 *  signOut() afterwards to clear the current session cookie. */
export async function revokeAllSessions(userId: string): Promise<number | null> {
  try {
    const snap = await firestore.collection(SESSIONS).where("userId", "==", userId).get();
    if (snap.empty) return 0;
    // Commit in ≤BATCH_LIMIT chunks so a user with many sessions never trips the
    // 500-op batch cap (which would throw and revoke nothing).
    for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
      const batch = firestore.batch();
      for (const d of snap.docs.slice(i, i + BATCH_LIMIT)) batch.delete(d.ref);
      await batch.commit();
    }
    return snap.size;
  } catch (err) {
    console.error(`[sessions] revokeAll failed for ${userId}:`, err);
    return null;
  }
}
