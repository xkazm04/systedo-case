/** Test-only in-memory stand-in for `@/lib/firebase`, exposing just the slice of
 *  the firebase-admin Firestore surface the per-(user, project, key) blob store
 *  uses: nested collection()/doc() paths, get/set, a whole-collection listing and
 *  a delete batch. Registered in place of the real module by ./firestore-fake-hook.mjs.
 *
 *  Exists so the FIRESTORE backend of a store can be exercised for real (doc-id
 *  composition, the JSON encode/decode, corrupt-blob handling, the prefix delete)
 *  without a Firebase project or an emulator — the sqlite backend already has real
 *  coverage, and a store that claims "both backends" should be proven on both. */

/** path (`users/u1/projectState/p1__key`) → stored document data */
const docs = new Map();

/** Serializes runTransaction callbacks (see `firestore.runTransaction`). */
let txChain = Promise.resolve();

/** Wipe every stored document — call between tests. */
export function resetFirestore() {
  docs.clear();
}

/** The raw store, for assertions about HOW a backend laid data out. */
export function firestoreDump() {
  return new Map(docs);
}

function docRef(path) {
  return {
    path,
    async get() {
      const data = docs.get(path);
      return { exists: data !== undefined, id: path.split("/").pop(), data: () => data };
    },
    async set(data) {
      docs.set(path, { ...data });
    },
    async delete() {
      docs.delete(path);
    },
  };
}

function collectionRef(path) {
  return {
    path,
    doc(id) {
      const child = `${path}/${id}`;
      return { ...docRef(child), collection: (name) => collectionRef(`${child}/${name}`) };
    },
    async get() {
      const prefix = `${path}/`;
      const hits = [...docs.entries()].filter(
        // Direct children only — a doc one level down, not a grandchild.
        ([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/")
      );
      return {
        docs: hits.map(([p, data]) => ({
          id: p.slice(prefix.length),
          ref: docRef(p),
          data: () => data,
        })),
      };
    },
  };
}

export const firestore = {
  collection: (name) => collectionRef(name),
  /** Stand-in for firebase-admin's transaction. Real Firestore gives a transaction
   *  SERIALIZABLE semantics (it aborts and retries a callback whose reads were
   *  invalidated), so the fake models the observable guarantee the cheapest honest
   *  way: transactions run one at a time, chained on a mutex, and `tx.get` therefore
   *  always sees everything previously committed. That is what makes a compare-and-
   *  swap here mean something — a writer that started from stale bytes finds them
   *  changed and loses, instead of silently overwriting the winner. */
  runTransaction(fn) {
    const run = txChain.then(() =>
      fn({
        async get(ref) {
          return ref.get();
        },
        set(ref, data) {
          docs.set(ref.path, { ...data });
        },
      })
    );
    // Keep the chain alive even if a callback rejects — one failed transaction must
    // not wedge every later one.
    txChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  },
  batch() {
    const ops = [];
    return {
      delete(ref) {
        ops.push(() => docs.delete(ref.path));
      },
      async commit() {
        for (const op of ops) op();
      },
    };
  },
};

export function storageBucket() {
  throw new Error("storageBucket is not implemented in the test firestore fake");
}
