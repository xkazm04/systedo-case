/** Session revocation for the Account & Security module. NextAuth runs the
 *  database session strategy with the Firestore adapter, so a session is a doc in
 *  the "sessions" collection keyed by `userId` — revoking one is deleting its doc.
 *  Both helpers are best-effort (a count/revoke failure must never break the page
 *  or the sign-out), and no-op safely when Firestore is absent (local/dev). */
import "server-only";
import { firestore } from "@/lib/firebase";

/** The @auth/firebase-adapter default sessions collection. */
const SESSIONS = "sessions";

export async function activeSessionCount(userId: string): Promise<number> {
  try {
    const snap = await firestore.collection(SESSIONS).where("userId", "==", userId).get();
    return snap.size;
  } catch {
    return 0;
  }
}

/** Delete every session doc for the user ("sign out everywhere"). Returns how many
 *  were revoked. The caller still calls signOut() afterwards to clear the current
 *  session cookie. */
export async function revokeAllSessions(userId: string): Promise<number> {
  try {
    const snap = await firestore.collection(SESSIONS).where("userId", "==", userId).get();
    if (snap.empty) return 0;
    const batch = firestore.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
  } catch {
    return 0;
  }
}
