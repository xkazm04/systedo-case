/** Test-only ESM load hook: turn a `.json` import into a default-exporting module,
 *  so tests can transitively import app modules that read JSON data (e.g.
 *  @/data/performance.json via @/lib/data) without a `with { type: "json" }`
 *  attribute at every call site. Registered by the test file that needs it (kept out
 *  of the shared resolve-hooks so it doesn't touch LLM-gate-hashed infra). */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    const raw = await readFile(fileURLToPath(new URL(url)), "utf8");
    // JSON is a valid JS expression → a one-line ES module, no import attribute needed.
    return { format: "module", source: `export default ${raw};`, shortCircuit: true };
  }
  return nextLoad(url, context);
}
