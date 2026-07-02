/** Shared fingerprint helpers for the LLM tooling scripts.
 *
 *  One implementation used by both scripts/llm-eval.mjs (contract goldens) and
 *  scripts/llm-gate.mjs (per-tool incremental gate) so the two can never
 *  disagree about what "this tool's contract" hashes to.
 */
import { createHash } from "node:crypto";

/** Deterministic key-sorted JSON — must mirror src/lib/llm/telemetry.ts. */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

/** Contract fingerprint (system prompt + schema) — what the goldens snapshot. */
export function fingerprint(system, schema) {
  return createHash("sha256").update(`${system} ${stableStringify(schema)}`).digest("hex").slice(0, 16);
}

/** Whole-entry fingerprint for the gate: everything that changes what a tool's
 *  real-model test actually exercises — system, prompt, schema AND the validator
 *  source. Broader than the golden fingerprint on purpose: a validate() edit
 *  changes test semantics without touching the contract, and must still re-prove
 *  that tool. (Edits to shared helpers the validator closes over don't show up
 *  here — the gate falls back to a full run when registry bytes change without
 *  any per-tool delta.) */
export function toolEntryFingerprint(tool) {
  return createHash("sha256")
    .update(
      stableStringify({
        system: tool.system,
        prompt: tool.prompt,
        schema: tool.schema,
        validate: String(tool.validate),
      })
    )
    .digest("hex")
    .slice(0, 16);
}
