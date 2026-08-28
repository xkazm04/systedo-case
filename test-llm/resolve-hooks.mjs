/** Minimal ESM resolve hook so `node --test` can import the app's TypeScript
 *  wrapper directly (Node 24 strips the types). Handles the three things plain Node
 *  doesn't: the `@/` path alias, extensionless relative imports (`./x` → `./x.ts`),
 *  and the bare `import dataset from "@/data/*.json"` the app writes (Next supplies
 *  the JSON loader; plain Node demands an explicit `with { type: "json" }`).
 */
import { stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extname, resolve as resolvePath } from "node:path";

async function exists(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

const EXT_CANDIDATES = [".ts", ".tsx", ".mts"];
// Real module extensions Node resolves on its own; anything else (e.g. a store
// dispatcher's `./store.local` / `./store.firestore`) still needs a `.ts` appended.
const REAL_EXTS = new Set([".ts", ".tsx", ".mts", ".js", ".mjs", ".cjs", ".json", ".node"]);

export async function resolve(specifier, context, nextResolve) {
  let spec = specifier;

  // @/x → <cwd>/src/x (as a file URL)
  if (spec.startsWith("@/")) {
    spec = pathToFileURL(resolvePath(process.cwd(), "src", spec.slice(2))).href;
  }

  const isRelative = spec.startsWith("./") || spec.startsWith("../");
  const isFileUrl = spec.startsWith("file:");
  const ext = extname(spec);

  if ((isRelative || isFileUrl) && (!ext || !REAL_EXTS.has(ext))) {
    const baseHref = isFileUrl
      ? spec
      : new URL(spec, context.parentURL ?? pathToFileURL(`${process.cwd()}/`).href).href;
    const basePath = fileURLToPath(baseHref);
    const candidates = [
      ...EXT_CANDIDATES.map((e) => basePath + e),
      ...EXT_CANDIDATES.map((e) => resolvePath(basePath, "index" + e)),
    ];
    for (const cand of candidates) {
      if (await exists(cand)) {
        return { url: pathToFileURL(cand).href, shortCircuit: true };
      }
    }
  }

  return nextResolve(spec, context);
}

/** Supply the `type: "json"` import attribute Node requires but the app's source
 *  omits (e.g. `@/lib/data` → `@/data/performance.json`), so importing a module
 *  whose graph reaches the sample dataset doesn't throw ERR_IMPORT_ATTRIBUTE_MISSING. */
export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.endsWith(".json")) {
    return nextLoad(url, { ...context, importAttributes: { type: "json" } });
  }
  return nextLoad(url, context);
}
