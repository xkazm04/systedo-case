/** The ADR-0001 blob store, proven ONCE against BOTH of its drivers.
 *
 *  `src/lib/project-state/store.local.ts` (a conditional sqlite UPDATE) and
 *  `src/lib/project-state/store.firestore.ts` (a Firestore transaction) are the
 *  record's own reference pair: genuinely different code expressing the same
 *  invariant. Each already had a suite; neither had the SEAM. The cases live in
 *  ./store-contract.mjs and run here against both drivers in one process, and the
 *  answers are compared — see that file's header for what that buys and what the
 *  in-memory Firestore fake cannot see.
 *
 *  Both backends are imported DIRECTLY rather than through ./store, because the
 *  dispatcher picks one at import time from `LOCAL_DB` and a process therefore only
 *  ever meets one of them. The dispatcher's own half — the envelope, the size
 *  budget, the typed ProjectStateConflictError it turns a `false` into — sits above
 *  both drivers and is pinned in test-unit/project-state-concurrency.test.mjs.
 *
 *  Rung: blocking (ADR-0007 — it passes today), inside `npm run test:unit`. */
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { BLOB_STORE_CONTRACT, runStoreContract } from "./store-contract.mjs";

// Swap `@/lib/firebase` for the in-memory fake BEFORE anything imports the cloud
// driver. Hooks run most-recently-registered first, so this wins over the shared
// `@/` → `src/` mapping.
register("./firestore-fake-hook.mjs", import.meta.url);

// A throwaway database per process, the same way every other sqlite-backed suite
// here does it. `LOCAL_DB` decides nothing in this file — the drivers are imported
// by name — but the local driver is only ever reached in that mode, so the flag is
// set to match the environment it runs in.
const dbFile = join(tmpdir(), `systedo-store-contract-blob-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const sqlite = await import("@/lib/project-state/store.local");
const cloud = await import("@/lib/project-state/store.firestore");
const { getDb } = await import("@/lib/db");
const { resetFirestore } = await import("./firestore-fake.mjs");

/** The raw driver interface, in the vocabulary the contract's cases speak. */
const adapt = (backend) => ({
  read: (user, project, key) => backend.readRawProjectState(user, project, key),
  write: (user, project, key, raw, expected) =>
    backend.writeRawProjectState(user, project, key, raw, expected),
  remove: (user, project) => backend.deleteProjectState(user, project),
});

runStoreContract({
  subject: "project-state",
  contract: BLOB_STORE_CONTRACT,
  drivers: [
    {
      name: "sqlite",
      store: adapt(sqlite),
      reset: () => {
        getDb().prepare("DELETE FROM project_state").run();
      },
    },
    {
      name: "firestore",
      store: adapt(cloud),
      reset: () => resetFirestore(),
    },
  ],
});
