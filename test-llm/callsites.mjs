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
const CLAUDE_PROVIDER = "src/lib/llm/claude.ts";

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

/** Provider SDK / CLI usage that leaked outside the wrapper provider files. */
export function checkChokepoint() {
  const violations = [];
  for (const file of srcFiles()) {
    const r = rel(file);
    const text = readFileSync(file, "utf8");
    if (/\bnew GoogleGenAI\b/.test(text) && r !== GEMINI_PROVIDER) {
      violations.push(`${r}: constructs GoogleGenAI outside ${GEMINI_PROVIDER}`);
    }
    if (/from ["']node:child_process["']/.test(text) && r !== CLAUDE_PROVIDER) {
      violations.push(`${r}: imports node:child_process outside ${CLAUDE_PROVIDER}`);
    }
  }
  return violations;
}
