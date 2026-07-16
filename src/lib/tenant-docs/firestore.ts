/** The Firestore implementation of {@link TenantDocs} (server-only). Selected by
 *  the dispatcher when LOCAL_DB is OFF. Every method reproduces the EXACT query the
 *  keyword / pattern / social stores issued before the backend seam existed — same
 *  collection/doc paths, same where/orderBy/limit, same add / delete / batch /
 *  transaction / set-merge semantics — so extracting the seam left the production
 *  Firestore path byte-identical. */
import "server-only";
import { firestore } from "@/lib/firebase";
import type { TenantDocs } from "./backend";

function col(tenant: string, collection: string) {
  return firestore.collection("tenants").doc(tenant).collection(collection);
}

export const firestoreTenantDocs: TenantDocs = {
  async getDoc(tenant, collection, id) {
    const snap = await col(tenant, collection).doc(id).get();
    return snap.exists ? snap.data() : undefined;
  },

  async setDoc(tenant, collection, id, data, opts) {
    const ref = col(tenant, collection).doc(id);
    if (opts?.merge) await ref.set(data, { merge: true });
    else await ref.set(data);
  },

  async addDoc(tenant, collection, data) {
    const ref = await col(tenant, collection).add(data);
    return ref.id;
  },

  async deleteDoc(tenant, collection, id) {
    await col(tenant, collection).doc(id).delete();
  },

  async listDocs(tenant, collection, opts) {
    let q: FirebaseFirestore.Query = col(tenant, collection);
    if (opts?.orderBy) q = q.orderBy(opts.orderBy.field, opts.orderBy.dir);
    if (opts?.limit !== undefined) q = q.limit(opts.limit);
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  },

  async queryEq(tenant, collection, field, value) {
    const snap = await col(tenant, collection).where(field, "==", value).get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  },

  async batchSet(tenant, collection, docs) {
    const b = firestore.batch();
    for (const { id, data } of docs) b.set(col(tenant, collection).doc(id), data);
    await b.commit();
  },

  async compareAndSet(tenant, collection, id, guard, patch) {
    const ref = col(tenant, collection).doc(id);
    return firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      if ((snap.data() ?? {})[guard.field] !== guard.equals) return false;
      tx.set(ref, patch, { merge: true });
      return true;
    });
  },
};
