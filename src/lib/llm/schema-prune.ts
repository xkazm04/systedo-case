/** Deterministic post-parse schema pruning.
 *
 *  Prompt-embedded providers (the Claude CLI, and every BYOM prompt-embed
 *  fallback) regularly return helpful-but-unrequested extra fields — the
 *  2026-08-05 quality matrix caught `risks`, `severity`, `intent`, `url`
 *  side-channels across four tools, each one a contract violation the judge
 *  penalized and a shape the app never reads. Gemini's native responseSchema
 *  prunes server-side; this makes every other path behave the same way for
 *  free: recursively drop object keys the schema doesn't declare.
 *
 *  Only OBJECT/ARRAY nodes with declared `properties`/`items` are walked — an
 *  untyped or free-form subtree passes through untouched, so a schema that
 *  deliberately leaves a node open keeps its full payload. Pure; server-only
 *  by usage (imported from the wrapper). */

interface SchemaNode {
  type?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
}

export function pruneToSchema(value: unknown, schema: object | undefined): unknown {
  return prune(value, (schema ?? {}) as SchemaNode);
}

function prune(value: unknown, node: SchemaNode): unknown {
  const type = typeof node.type === "string" ? node.type.toUpperCase() : undefined;
  if (type === "OBJECT" && node.properties && value && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node.properties)) {
      if (key in (value as Record<string, unknown>)) {
        out[key] = prune((value as Record<string, unknown>)[key], child);
      }
    }
    return out;
  }
  if (type === "ARRAY" && node.items && Array.isArray(value)) {
    return value.map((v) => prune(v, node.items as SchemaNode));
  }
  return value;
}
