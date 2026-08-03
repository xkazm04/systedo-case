/** Test-only ESM resolve hook: redirect `@/lib/firebase` to the in-memory fake in
 *  ./firestore-fake.mjs, so a store's FIRESTORE backend can be exercised without a
 *  Firebase project, credentials or an emulator. Registered by the test file that
 *  needs it (kept out of the shared resolve-hooks so it doesn't touch
 *  LLM-gate-hashed infra, and so no other test is affected).
 *
 *  Hooks run most-recently-registered first, so registering this inside a test file
 *  puts it ahead of the shared `@/` → `src/` mapping. */
import { pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

const FAKE = pathToFileURL(resolvePath(process.cwd(), "test-unit", "firestore-fake.mjs")).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/firebase") return { url: FAKE, shortCircuit: true };
  return nextResolve(specifier, context);
}
