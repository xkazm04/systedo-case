/** Convert a tool's Google-`Type`-form schema (how the app's 15 tools declare
 *  their output, e.g. `{ type: Type.OBJECT, properties, required, propertyOrdering }`)
 *  into a strict JSON Schema for OpenAI / Anthropic native structured output:
 *    - types lowercased (OBJECT→object, ARRAY→array, STRING→string, …),
 *    - every object gets `additionalProperties: false`,
 *    - EVERY property is listed in `required` (OpenAI strict mode demands it); a
 *      property that was optional in the source (absent from `required`, or
 *      `nullable: true`) is made nullable (`type: [T, "null"]`) so the strict
 *      schema still lets the model omit it — the tools' normalizers already treat
 *      null/missing as empty,
 *    - Google-only keys (`propertyOrdering`, `nullable`, `format`) are dropped.
 *  Pure + framework-free, so it's unit-tested in isolation. Accepts either the
 *  uppercase `Type` enum values or lowercase, so it's robust to either form. */

type Json = Record<string, unknown>;

const TYPE_MAP: Record<string, string> = {
  OBJECT: "object",
  ARRAY: "array",
  STRING: "string",
  NUMBER: "number",
  INTEGER: "integer",
  BOOLEAN: "boolean",
};

function baseType(t: unknown): string {
  return TYPE_MAP[String(t).toUpperCase()] ?? "string";
}

/** Widen a converted schema's type to also allow null (for an optional field). */
function nullable(schema: Json): Json {
  const next: Json = { ...schema };
  const t = next.type;
  next.type = Array.isArray(t) ? (t.includes("null") ? t : [...t, "null"]) : [t, "null"];
  // A nullable enum must also list null as an allowed value under strict mode.
  if (Array.isArray(next.enum) && !next.enum.includes(null)) {
    next.enum = [...next.enum, null];
  }
  return next;
}

function convert(node: unknown): Json {
  if (!node || typeof node !== "object") return { type: "string" };
  const n = node as Json;
  const type = baseType(n.type);
  const out: Json = { type };
  if (typeof n.description === "string") out.description = n.description;
  if (Array.isArray(n.enum)) out.enum = [...n.enum];

  if (type === "object") {
    const props = (n.properties && typeof n.properties === "object" ? n.properties : {}) as Json;
    const required = new Set(Array.isArray(n.required) ? (n.required as string[]) : []);
    const outProps: Json = {};
    for (const [key, child] of Object.entries(props)) {
      const childNode = (child ?? {}) as Json;
      let converted = convert(childNode);
      // Optional in the source, or explicitly nullable → keep it required (strict)
      // but allow null so the model can still leave it out.
      if (!required.has(key) || childNode.nullable === true) converted = nullable(converted);
      outProps[key] = converted;
    }
    out.properties = outProps;
    out.required = Object.keys(outProps); // strict mode: every property is required
    out.additionalProperties = false;
  } else if (type === "array") {
    out.items = convert(n.items);
  }

  return out;
}

/** Google-`Type` schema → strict JSON Schema (see the module doc). */
export function toJsonSchema(typeSchema: object): object {
  return convert(typeSchema);
}
