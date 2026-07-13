/** Shared fingerprint helpers for the LLM tooling scripts.
 *
 *  One implementation used by both scripts/llm-eval.mjs (contract goldens) and
 *  scripts/llm-gate.mjs (per-tool incremental gate) so the two can never
 *  disagree about what "this tool's contract" hashes to.
 */
import { createHash } from "node:crypto";

/** Normalize CRLF → LF. `system`/`prompt` are multi-line template-literal string
 *  VALUES and `validate` is reflected via Function#toString() — both carry the
 *  exact line-ending bytes of the source file they were parsed from. Windows'
 *  core.autocrlf=true checks the same LF-stored git blob out as CRLF locally
 *  while Linux CI checks it out as LF, so without this, every fingerprint would
 *  differ cross-platform with no actual code change. */
function eol(s) {
  return typeof s === "string" ? s.replace(/\r\n/g, "\n") : s;
}

/** Deterministic key-sorted JSON — must mirror src/lib/llm/telemetry.ts. */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

/** Contract fingerprint (system prompt + schema) — what the goldens snapshot. */
export function fingerprint(system, schema) {
  return createHash("sha256").update(`${eol(system)} ${stableStringify(schema)}`).digest("hex").slice(0, 16);
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
        system: eol(tool.system),
        prompt: eol(tool.prompt),
        schema: tool.schema,
        validate: eol(String(tool.validate)),
      })
    )
    .digest("hex")
    .slice(0, 16);
}
