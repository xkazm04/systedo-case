/** Pure string transforms behind `npm run llm:new` (scripts/llm-new-tool.mjs).
 *
 *  Adding an LLM tool is a five-part manual ritual — call-site tag, registry
 *  fixture, golden, HASHED_FILES line, and knowing the gate cost — and the
 *  ritual has been fumbled before (the social.ts hash-list omission). These
 *  helpers make each step a deterministic transform so the CLI can do them in
 *  one shot and the unit tests can prove the transforms against fixtures
 *  WITHOUT touching the real (gate-hashed) files.
 *
 *  No I/O here on purpose: the CLI owns reading/writing; this module owns
 *  correctness.
 */

// The wrapper's exported name, composed so this file can never register as a
// phantom call site (the gate greps for the name followed by an open paren).
export const WRAPPER_NAME = ["generate", "Structured"].join("");

/** Tool ids must match the `// llm-tool: <id>` tag grammar the gate scans for. */
export function validToolId(id) {
  return typeof id === "string" && /^[a-z0-9][a-z0-9-]*$/.test(id);
}

/** The registry fixture skeleton for a new tool — mirrors the house style:
 *  Czech system prompt, a small representative prompt, a Type.OBJECT schema and
 *  a lenient isStr validator. TODO markers show exactly what to specialise. */
export function buildRegistryEntry({ id, label }) {
  return [
    "  {",
    `    id: "${id}",`,
    `    label: "${label}",`,
    "    system:",
    '      "Jsi český marketingový specialista. Piš česky a vracej pouze validní JSON dle schématu.", // TODO: specialise the role',
    "    prompt:",
    '      "TODO: krátký reprezentativní vstup, na kterém se nástroj prokazuje (reálná čísla, ne lorem ipsum).",',
    "    schema: {",
    "      type: Type.OBJECT,",
    "      properties: {",
    "        summary: { type: Type.STRING }, // TODO: mirror the tool's real result shape",
    "      },",
    '      required: ["summary"],',
    "    },",
    "    // Lenient on purpose: assert shape/presence, not exact wording — strict",
    "    // every()-style checks flake under model variance (see article-draft).",
    "    validate: (r) => r && isStr(r.summary),",
    "  },",
  ].join("\n");
}

/** Insert a registry entry before the closing `];` of the LLM_TOOLS array.
 *  Throws when the id is already registered or the anchor can't be found, so a
 *  drifted registry layout fails loudly instead of scaffolding garbage. */
export function insertRegistryEntry(source, { id, label }) {
  if (new RegExp(`^\\s*id: "${id}",$`, "m").test(source)) {
    throw new Error(`tool "${id}" is already registered in test-llm/registry.mjs`);
  }
  const anchor = source.lastIndexOf("\n];");
  if (anchor === -1) {
    throw new Error("could not find the closing `];` of LLM_TOOLS in test-llm/registry.mjs");
  }
  const entry = buildRegistryEntry({ id, label });
  return `${source.slice(0, anchor)}\n${entry}${source.slice(anchor)}`;
}

/** The exact call-site snippet to paste into the tool module: the `// llm-tool:`
 *  tag INSIDE the wrapper args (within the ±2-line window the gate pairs tags
 *  by) plus the `id:` telemetry attribution arg. */
export function callSiteSnippet(id) {
  return [
    `  return ${WRAPPER_NAME}({`,
    `    // llm-tool: ${id}`,
    `    id: "${id}",`,
    "    prompt: buildPrompt(req),",
    "    system: SYSTEM,",
    "    schema: SCHEMA,",
    "    validate: validateResult,",
    "    demo: () => demoResult(req),",
    "    locale,",
    "    signal,",
    "  });",
  ].join("\n");
}
