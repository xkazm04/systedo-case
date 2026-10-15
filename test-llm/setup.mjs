/** Test bootstrap: register the resolve hook (so .ts wrapper imports work) and
 *  default the environment to development (→ Claude provider) unless explicitly
 *  set. Loaded via `node --import ./test-llm/setup.mjs`. */
import { register } from "node:module";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import { rmSync, rmdirSync } from "node:fs";

if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";

// Isolate the local SQLite db per test process. `node --test` runs each test file in
// its own worker; pointing them at one shared `.data/systedo.db` makes parallel writers
// contend on the write lock (flaky "database is locked"). A per-pid file removes it.
if (!process.env.SYSTEDO_DB_FILE) {
  process.env.SYSTEDO_DB_FILE = join(tmpdir(), "systedo-test", `db-${process.pid}.db`);
}

// The test db lives in the OS temp dir and every suite points SYSTEDO_DB_FILE at its own file,
// so without this each run leaves one `.db` per suite behind. At exit, close the handle (an open
// SQLite handle makes the unlink fail on Windows) and remove the db and its WAL/SHM files. Only
// files inside the temp dir are touched; a db the operator pointed elsewhere is left alone.
process.on("exit", () => {
  const file = process.env.SYSTEDO_DB_FILE;
  if (!file || !file.endsWith(".db") || !file.startsWith(tmpdir() + sep)) return;
  try {
    globalThis.__systedoDb?.close();
  } catch {
    /* already closed */
  }
  for (const ext of ["", "-wal", "-shm"]) {
    try {
      rmSync(file + ext, { force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* still held: the next run's pre-clean takes it */
    }
  }
  try {
    rmdirSync(join(tmpdir(), "systedo-test")); // only succeeds when empty
  } catch {
    /* other suites still have files in it */
  }
});

register("./resolve-hooks.mjs", import.meta.url);
