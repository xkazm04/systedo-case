/** How healthy is one LLM generation? — the wrapper's output-quality verdict, kept
 *  pure and provider-free so it is unit-testable without emitting a telemetry row.
 *
 *  `generateStructured` already knew whether a generation came back structurally
 *  broken; the verdict simply never left the Firestore telemetry entry, so the user
 *  saw a truncated answer rendered exactly like a clean one and support could not
 *  correlate a complaint without pulling Firestore. The rule itself lives here; the
 *  wrapper only dispatches on it and stamps `meta.status`.
 *
 *  Not an llm-tool (no generateStructured call site, no provider access) — safe to
 *  import from anywhere on the server. */
import type { AiCallStatus } from "../ai-types";

/** Top-level required field names declared by a Google-`Type` / JSON schema. */
export function requiredFields(schema: object): string[] {
  const s = schema as { required?: unknown };
  return Array.isArray(s.required) ? (s.required as string[]) : [];
}

/** A call that "succeeded" (parsed to an object) can still be corrupt or truncated — a model that
 *  stopped mid-JSON, or a degenerate one-liner that happened to parse. Flag it when it isn't an
 *  object, or is missing more than a third of the schema's required fields. Used so the telemetry
 *  records an ERROR even though the call didn't throw and the app still normalizes it to keep working
 *  — otherwise monitoring would read a truncated/garbage response as a healthy success. */
export function looksCorrupt(parsed: unknown, schema: object): boolean {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return true;
  const req = requiredFields(schema);
  if (!req.length) return false;
  const obj = parsed as Record<string, unknown>;
  const missing = req.filter((k) => obj[k] === undefined || obj[k] === null);
  return missing.length > Math.max(1, Math.floor(req.length / 3));
}

/** The wrapper's honest one-word verdict on a generation. "corrupt" outranks
 *  "repaired": an answer that came back structurally broken is degraded whether or
 *  not a repair re-prompt was attempted along the way. */
export function callStatus(corrupt: boolean, repaired: boolean): AiCallStatus {
  return corrupt ? "corrupt" : repaired ? "repaired" : "success";
}

/** Is this verdict one the USER should be told about? "repaired" is invisible
 *  house-keeping — the answer is fine, it just took two tries, and the existing
 *  "Samoopraveno" pill already covers it. "corrupt" means the answer in front of
 *  them may genuinely be missing pieces, which is worth a quiet retry nudge. */
export function isDegraded(status: AiCallStatus | undefined): boolean {
  return status === "corrupt";
}
