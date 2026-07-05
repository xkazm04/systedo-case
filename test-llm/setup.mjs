/** Test bootstrap: register the resolve hook (so .ts wrapper imports work) and
 *  default the environment to development (→ Claude provider) unless explicitly
 *  set. Loaded via `node --import ./test-llm/setup.mjs`. */
import { register } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";

if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";

// Isolate the local SQLite db per test process. `node --test` runs each test file in
// its own worker; pointing them at one shared `.data/systedo.db` makes parallel writers
// contend on the write lock (flaky "database is locked"). A per-pid file removes it.
if (!process.env.SYSTEDO_DB_FILE) {
  process.env.SYSTEDO_DB_FILE = join(tmpdir(), "systedo-test", `db-${process.pid}.db`);
}

register("./resolve-hooks.mjs", import.meta.url);
