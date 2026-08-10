/** Test-only ESM resolve hook: redirect `@/lib/firebase` to the query-capable fake
 *  in ./activity-firestore-fake.mjs, so the activity feed's FIRESTORE backend can be
 *  exercised without a Firebase project, credentials or an emulator. Registered by
 *  the test file that needs it (mirrors firestore-fake-hook.mjs — kept out of the
 *  shared resolve-hooks so no other test is affected).
 *
 *  Hooks run most-recently-registered first, so registering this inside a test file
 *  puts it ahead of the shared `@/` → `src/` mapping. */
import { pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

const FAKE = pathToFileURL(
  resolvePath(process.cwd(), "test-unit", "activity-firestore-fake.mjs")
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/firebase") return { url: FAKE, shortCircuit: true };
  return nextResolve(specifier, context);
}
