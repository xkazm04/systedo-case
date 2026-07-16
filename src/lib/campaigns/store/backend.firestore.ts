/** The Firestore implementation of {@link TenantDocStore} (server-only). Selected
 *  by the dispatcher when LOCAL_DB is OFF. Every method reproduces the EXACT query
 *  the four campaign-data stores issued before the backend seam existed — same
 *  collection/doc paths, same where/orderBy/limit, same set-merge semantics — so
 *  extracting the seam left the production Firestore path byte-identical. */
import "server-only";
import { FieldPath } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase";
import type { TenantBatch, TenantDocStore } from "./backend";

function tenantDoc(tenant: string) {
  return firestore.collection("tenants").doc(tenant);
}

export const firestoreTenantStore: TenantDocStore = {
  async getRoot(tenant) {
    return (await tenantDoc(tenant).get()).data();
  },

  async setRoot(tenant, data, opts) {
    const ref = tenantDoc(tenant);
    if (opts.merge) await ref.set(data, { merge: true });
    else await ref.set(data);
  },

  async getDoc(tenant, collection, docId) {
    const snap = await tenantDoc(tenant).collection(collection).doc(docId).get();
    return snap.exists ? snap.data() : undefined;
  },

  async setDoc(tenant, collection, docId, data, opts) {
    const ref = tenantDoc(tenant).collection(collection).doc(docId);
    if (opts?.merge) await ref.set(data, { merge: true });
    else await ref.set(data);
  },

  async addDoc(tenant, collection, data) {
    await tenantDoc(tenant).collection(collection).add(data);
  },

  async listDocs(tenant, collection, orderBy) {
    const snap = await tenantDoc(tenant)
      .collection(collection)
      .orderBy(orderBy.field, orderBy.dir)
      .get();
    return snap.docs.map((d) => d.data());
  },

  async queryEq(tenant, collection, field, value) {
    const snap = await tenantDoc(tenant).collection(collection).where(field, "==", value).get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  },

  async idRange(tenant, collection, opts) {
    let q = tenantDoc(tenant).collection(collection).orderBy(FieldPath.documentId(), opts.dir);
    if (opts.gte !== undefined) q = q.where(FieldPath.documentId(), ">=", opts.gte);
    if (opts.lt !== undefined) q = q.where(FieldPath.documentId(), "<", opts.lt);
    const snap = await q.limit(opts.limit).get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  },

  batch(tenant): TenantBatch {
    const root = tenantDoc(tenant);
    const b = firestore.batch();
    return {
      setRoot(data, opts) {
        if (opts.merge) b.set(root, data, { merge: true });
        else b.set(root, data);
      },
      set(collection, docId, data) {
        b.set(root.collection(collection).doc(docId), data);
      },
      delete(collection, docId) {
        b.delete(root.collection(collection).doc(docId));
      },
      async commit() {
        await b.commit();
      },
    };
  },
};
