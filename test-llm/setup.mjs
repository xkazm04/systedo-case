/** Test bootstrap: register the resolve hook (so .ts wrapper imports work) and
 *  default the environment to development (→ Claude provider) unless explicitly
 *  set. Loaded via `node --import ./test-llm/setup.mjs`. */
import { register } from "node:module";

if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";

register("./resolve-hooks.mjs", import.meta.url);
