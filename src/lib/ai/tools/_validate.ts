/** Shared validation scaffolding for the structured AI tools.
 *
 *  The wrapper (generateStructured) treats a NON-EMPTY `validate()` result as a
 *  set of violations and re-prompts the model ONCE to self-correct before
 *  normalize()'s deterministic floor takes over. Several tools historically
 *  returned `[]` for a non-object parse (`if (!o || typeof o !== "object") return []`),
 *  so a truncated stream or a bare string/array that happened to "parse" skipped
 *  that one repair pass and fell straight to the demo floor — rendering canned
 *  text as if it were a real model answer.
 *
 *  `withObjectGuard` fixes that in one place: a non-object ALWAYS fails, in every
 *  tool, so a truncated/garbage response is retried instead of silently papered
 *  over. Pure; unit-tested in test-unit. Not itself an LLM tool (underscore-
 *  prefixed, like `_shared` / `_coerce`) — no provider access. */
import { txt } from "./_shared";

/** Violation raised when the model returned something that is not a JSON object
 *  at all (truncated output, a bare string / array, null). A hard failure that
 *  triggers the wrapper's single repair re-prompt. */
export const NOT_OBJECT_VIOLATION =
  "Výstup není platný JSON objekt — vrať CELÝ objekt přesně podle schématu, nic okolo.";

/** Narrow a parsed model output to a plain record, or null when it isn't one.
 *  Arrays and null are rejected — neither is a usable tool object. */
export function asRecord(parsed: unknown): Record<string, unknown> | null {
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

/** Wrap a per-object validation body so a non-object parse ALWAYS fails (→ the
 *  wrapper re-prompts once) instead of silently passing. The body runs only on a
 *  real object and returns its field-level violations. */
export function withObjectGuard(
  body: (o: Record<string, unknown>) => string[]
): (parsed: unknown) => string[] {
  return (parsed) => {
    const o = asRecord(parsed);
    if (!o) return [NOT_OBJECT_VIOLATION];
    return body(o);
  };
}

/** Collect "missing required string field" violations for a record — the
 *  consistent minimum bar every tool shares. `fields` pairs each required key
 *  with the Czech violation to raise when it is empty / not a string. */
export function missingStrFields(
  o: Record<string, unknown>,
  fields: ReadonlyArray<readonly [key: string, message: string]>
): string[] {
  return fields.filter(([k]) => !txt(o[k])).map(([, m]) => m);
}
