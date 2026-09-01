/** The ADR-0001 activity feed, proven ONCE against BOTH of its drivers.
 *
 *  `src/lib/campaigns/activity.local.ts` reads the generic `tenant_docs` twin with
 *  `ORDER BY json_extract(...) DESC, rowid DESC`; `activity.firestore.ts` issues
 *  `where("at",">=").orderBy("at","desc").limit(n)`. Same promise, two engines —
 *  and this is the pair carrying the ordering invariant ADR-0001 calls out as the
 *  easy one to get wrong: a read that sorts on a timestamp and then SLICES to a cap
 *  selects a different set of rows on two drivers unless the answer is pinned.
 *
 *  The cases live in ./store-contract.mjs and run here against both drivers in one
 *  process; that file's header states what the in-memory fake can and cannot
 *  answer, and the tie case is deliberately uncapped for exactly that reason.
 *
 *  Both backends are imported DIRECTLY rather than through ./activity, because the
 *  dispatcher picks one at import time from `LOCAL_DB`. Its own half — the
 *  `{records, ok}` outage contract and the `at` stamp — sits above both drivers and
 *  is pinned in test-unit/activity-store-local.test.mjs and
 *  test-unit/activity-store-firestore.test.mjs.
 *
 *  Rung: blocking (ADR-0007 — it passes today), inside `npm run test:unit`. */
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { FEED_STORE_CONTRACT, runStoreContract } from "./store-contract.mjs";

// The query-capable fake, in place of `@/lib/firebase`, before the cloud driver is
// imported. Registered here rather than in the shared resolve hooks so no other
// suite is affected.
register("./activity-firestore-fake-hook.mjs", import.meta.url);

const dbFile = join(tmpdir(), `systedo-store-contract-feed-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const sqlite = await import("@/lib/campaigns/activity.local");
const cloud = await import("@/lib/campaigns/activity.firestore");
const { getDb } = await import("@/lib/db");
const { resetFirestore } = await import("./activity-firestore-fake.mjs");

/** The feed driver interface, in the vocabulary the contract's cases speak. */
const adapt = (backend) => ({
  append: (tenant, record) => backend.appendActivity(tenant, record),
  read: (tenant, opts) => backend.readActivity(tenant, opts),
});

runStoreContract({
  subject: "activity-feed",
  contract: FEED_STORE_CONTRACT,
  drivers: [
    {
      name: "sqlite",
      store: adapt(sqlite),
      reset: () => {
        getDb().prepare("DELETE FROM tenant_docs WHERE collection = ?").run("activity");
      },
    },
    {
      name: "firestore",
      store: adapt(cloud),
      reset: () => resetFirestore(),
    },
  ],
});
