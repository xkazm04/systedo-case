/** Static analysis of LLM wrapper usage across the app. Shared by the coverage
 *  test and the pre-commit gate so "list all places using the wrapper" has one
 *  implementation.
 *
 *  Contract enforced elsewhere:
 *   - every `generateStructured(` call site (outside the wrapper itself) must
 *     carry a `// llm-tool: <id>` tag,
 *   - every tag id must have a registry entry (= a real test),
 *   - provider SDKs / CLI spawning live ONLY in the wrapper (single chokepoint).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const WRAPPER_DEF = "src/lib/llm/index.ts"; // where generateStructured is defined
const GEMINI_PROVIDER = "src/lib/llm/gemini.ts";
// The keyless dev CLI providers — the ONLY files allowed to spawn a child
// process. One entry per CLI transport (claude.ts, codex.ts), nothing else.
const CLI_PROVIDERS = ["src/lib/llm/claude.ts", "src/lib/llm/codex.ts"];

const rel = (f) => relative(ROOT, f).split("\\").join("/");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

export function srcFiles() {
  return walk(SRC);
}

/** All `generateStructured(` call sites and all `// llm-tool:` tags in src. */
export function findCallSites() {
  const callSites = [];
  const tags = [];
  for (const file of srcFiles()) {
    const r = rel(file);
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (r !== WRAPPER_DEF && /\bgenerateStructured\s*\(/.test(line)) {
        callSites.push({ file: r, line: i + 1 });
      }
      const m = line.match(/\/\/\s*llm-tool:\s*([a-z0-9-]+)/i);
      if (m) tags.push({ file: r, line: i + 1, id: m[1] });
    });
  }
  return { callSites, tags };
}

/** Operations deliberately NOT offered in the BYOM matrix, with the reason. Empty
 *  today: every `// llm-tool:` id is assignable. An entry here is a product
 *  decision (e.g. a tool whose metering or provider is fixed), not a shortcut for
 *  "we forgot to add the row" — a missing row means a paying BYOM subscriber
 *  cannot pin that operation at all and it silently rides the global activeVendor
 *  fallback (src/lib/llm/keys/store.ts). */
export const BYOM_OPERATION_EXCLUSIONS = {
  // "example-tool": "why it can never be user-assigned",
};

/** The operation ids the BYOM matrix offers, read statically from
 *  src/lib/llm/keys/types.ts — no TS loader needed, so the pre-commit gate and the
 *  coverage test share one implementation (as they do for call sites). */
export function byomOperationIds() {
  const text = readFileSync(join(SRC, "lib/llm/keys/types.ts"), "utf8");
  const start = text.indexOf("export const BYOM_OPERATIONS");
  if (start === -1) return [];
  const end = text.indexOf("\n];", start);
  const block = text.slice(start, end === -1 ? text.length : end);
  return [...block.matchAll(/\{\s*id:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
}

/** Drift between the BYOM matrix's operation list and the real wrapper call sites.
 *  Without this, a new tool ships un-assignable (and an id typo silently dead). */
export function checkByomOperations() {
  const violations = [];
  const offered = new Set(byomOperationIds());
  const { tags } = findCallSites();
  const real = new Set(tags.map((t) => t.id));

  if (offered.size === 0) {
    violations.push("could not read BYOM_OPERATIONS from src/lib/llm/keys/types.ts");
    return violations;
  }
  for (const id of real) {
    if (offered.has(id) || id in BYOM_OPERATION_EXCLUSIONS) continue;
    violations.push(
      `llm-tool "${id}" has no BYOM_OPERATIONS row — add it (with cs + en labels) or document it in BYOM_OPERATION_EXCLUSIONS`
    );
  }
  for (const id of offered) {
    if (real.has(id)) continue;
    violations.push(`BYOM_OPERATIONS lists "${id}", which is not a // llm-tool id in src — stale row or typo`);
  }
  for (const id of Object.keys(BYOM_OPERATION_EXCLUSIONS)) {
    if (!real.has(id)) violations.push(`BYOM_OPERATION_EXCLUSIONS documents "${id}", which no longer exists`);
    if (offered.has(id)) violations.push(`"${id}" is both excluded and offered — drop one`);
  }
  return violations;
}

/** Provider SDK / CLI usage that leaked outside the wrapper provider files. */
export function checkChokepoint() {
  const violations = [];
  for (const file of srcFiles()) {
    const r = rel(file);
    const text = readFileSync(file, "utf8");
    if (/\bnew GoogleGenAI\b/.test(text) && r !== GEMINI_PROVIDER) {
      violations.push(`${r}: constructs GoogleGenAI outside ${GEMINI_PROVIDER}`);
    }
    if (/from ["']node:child_process["']/.test(text) && !CLI_PROVIDERS.includes(r)) {
      violations.push(`${r}: imports node:child_process outside ${CLI_PROVIDERS.join(" / ")}`);
    }
  }
  return violations;
}
