/** Pure planning for the incremental LLM gate (scripts/llm-gate.mjs).
 *
 *  Given "what changed" (already computed from file hashes + registry
 *  fingerprints), decide what the real-model run must re-prove:
 *
 *    skip     nothing relevant changed — the cached proof stands
 *    partial  every change attributes to specific tools → re-prove only those
 *    full     a shared file changed (wrapper, providers, _shared, API routes,
 *             test harness), a registry edit couldn't be attributed to a single
 *             tool, --force, or the whole registry is affected anyway
 *
 *  Deliberately conservative: anything that cannot be attributed to a specific
 *  tool falls back to the full suite. Framework- and I/O-free so it is
 *  unit-testable (test-unit/gate-plan.test.mjs).
 */

/**
 * @param {{
 *   force?: boolean,
 *   changedFiles?: string[],           // hashed files whose content hash differs from the cache
 *   fileTools?: Record<string, string[]>, // file → tool ids tagged in it (single-tool attribution)
 *   registryFile?: string,             // path of the registry (attributed via per-tool fingerprints)
 *   registryChangedTools?: string[],   // ids whose whole-entry fingerprint differs from the cache
 *   registryUnattributed?: boolean,    // registry bytes changed with no per-tool fingerprint delta
 *   unprovenTools?: string[],          // registered ids with no cached proof (new tools)
 *   allTools?: string[],               // every registered id
 * }} input
 * @returns {{ mode: "skip"|"partial"|"full", tools: string[], reason?: string, reasons?: string[] }}
 */
export function planGateRun({
  force = false,
  changedFiles = [],
  fileTools = {},
  registryFile = "test-llm/registry.mjs",
  registryChangedTools = [],
  registryUnattributed = false,
  unprovenTools = [],
  allTools = [],
} = {}) {
  if (force) return { mode: "full", tools: [...allTools], reason: "--force" };

  const reasons = [];
  const tools = new Set();

  for (const file of changedFiles) {
    if (file === registryFile) continue; // attributed below via per-tool fingerprints
    const ids = fileTools[file];
    if (!ids || ids.length === 0) {
      return {
        mode: "full",
        tools: [...allTools],
        reason: `${file} is shared LLM code (not attributable to a single tool)`,
      };
    }
    for (const id of ids) tools.add(id);
    reasons.push(`${file} → ${ids.join(", ")}`);
  }

  if (registryUnattributed) {
    return {
      mode: "full",
      tools: [...allTools],
      reason: `${registryFile} changed outside any single tool entry (shared helpers?)`,
    };
  }
  for (const id of registryChangedTools) {
    tools.add(id);
    reasons.push(`${registryFile} entry → ${id}`);
  }
  for (const id of unprovenTools) {
    tools.add(id);
    reasons.push(`no cached proof → ${id}`);
  }

  if (tools.size === 0) return { mode: "skip", tools: [], reason: "no relevant changes" };
  if (allTools.length > 0 && tools.size >= allTools.length) {
    return { mode: "full", tools: [...allTools], reason: "every registered tool is affected" };
  }
  return { mode: "partial", tools: [...tools].sort(), reasons };
}
