/** Test-only in-memory stand-in for `@/lib/firebase`, exposing exactly the slice of
 *  the firebase-admin surface the tenant activity feed uses:
 *  `collection("tenants").doc(t).collection("activity")` with `.add()` and a
 *  chainable `.where("at", ">=", iso).orderBy("at","desc").limit(n).get()`.
 *
 *  Kept separate from ./firestore-fake.mjs (which models the blob store's
 *  get/set/batch/transaction surface and has no query builder) so neither fake has
 *  to grow semantics its own tests do not assert. Registered in place of the real
 *  module by ./activity-firestore-fake-hook.mjs. */

/** `tenants/{tenant}/activity` → [{ id, data }] in insertion order */
const cols = new Map();
let nextId = 0;

/** When false, every read/write rejects — the fake's stand-in for "Firestore is
 *  unreachable", so the `{records, ok:false}` outage contract can be proven rather
 *  than assumed. */
let available = true;

export function setFirestoreAvailable(v) {
  available = v;
}

export function resetFirestore() {
  cols.clear();
  nextId = 0;
  available = true;
}

/** Raw rows of one collection path, for assertions about HOW the backend wrote. */
export function firestoreDump(path) {
  return (cols.get(path) ?? []).map((r) => ({ ...r, data: { ...r.data } }));
}

function outage() {
  return Promise.reject(new Error("fake firestore: unavailable"));
}

function query(path, filters, order, cap) {
  return {
    where: (field, op, value) => query(path, [...filters, { field, op, value }], order, cap),
    orderBy: (field, dir) => query(path, filters, { field, dir }, cap),
    limit: (n) => query(path, filters, order, n),
    async get() {
      if (!available) return outage();
      let rows = [...(cols.get(path) ?? [])];
      for (const f of filters) {
        if (f.op !== ">=") throw new Error(`fake firestore: unsupported operator ${f.op}`);
        rows = rows.filter((r) => r.data[f.field] >= f.value);
      }
      if (order) {
        // Stable within equal keys, matching the local twin's rowid tie-break.
        const dir = order.dir === "desc" ? -1 : 1;
        rows = rows
          .map((r, i) => ({ r, i }))
          .sort((a, b) => {
            const x = String(a.r.data[order.field] ?? "");
            const y = String(b.r.data[order.field] ?? "");
            return x === y ? (a.i - b.i) * dir : (x < y ? -1 : 1) * dir;
          })
          .map((w) => w.r);
      }
      if (cap !== undefined) rows = rows.slice(0, cap);
      return { docs: rows.map((r) => ({ id: r.id, data: () => ({ ...r.data }) })) };
    },
  };
}

function collectionRef(path) {
  return {
    ...query(path, [], undefined, undefined),
    path,
    doc: (id) => ({ collection: (name) => collectionRef(`${path}/${id}/${name}`) }),
    async add(data) {
      if (!available) return outage();
      const id = `doc-${++nextId}`;
      if (!cols.has(path)) cols.set(path, []);
      cols.get(path).push({ id, data: { ...data } });
      return { id };
    },
  };
}

export const firestore = {
  collection: (name) => collectionRef(name),
};

export function storageBucket() {
  throw new Error("storageBucket is not implemented in the activity firestore fake");
}
