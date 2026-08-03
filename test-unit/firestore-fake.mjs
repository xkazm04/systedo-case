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
