/** Shared coercion for LLM-returned enum fields. Every structured tool that lets
 *  the model pick from a fixed set (channel category/effort, lead-source cause/
 *  severity, …) needs the same shape: lower-case the raw value, keep it only if
 *  it's a known member, else fall back. This is that shape, written once.
 *
 *  Not an LLM tool itself (underscore-prefixed, like `_shared`) — pure,
 *  deterministic post-processing, so it stays out of the tool registry. */
import { txt } from "./_shared";

/** Build a coercer that maps an arbitrary model value to a member of `allowed`
 *  (compared case-insensitively after `txt`), returning `fallback` when it isn't
 *  one. `fallback` may be a member of the set (required fields) or `undefined`
 *  (optional fields), and the return type reflects that. */
export function coerceEnum<T extends string, F>(
  allowed: Iterable<string>,
  fallback: F
): (v: unknown) => T | F {
  const set = new Set<string>(allowed);
  return (v: unknown): T | F => {
    const c = txt(v).toLowerCase();
    return set.has(c) ? (c as T) : fallback;
  };
}
