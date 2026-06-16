/** AI Skill SDK — the contract that turns the single generateStructured
 *  chokepoint into an extensible plugin surface. A skill is a self-contained,
 *  testable unit (id, schema, prompt builder, normalizer, deterministic demo,
 *  optional validator). The registry refuses to load any skill that the
 *  prove-once gate doesn't cover, so quality is enforced by construction. Pure —
 *  only a type import from the wrapper (erased), safe to import anywhere. */
import type { GenerateArgs } from "@/lib/llm";

export type SkillCategory = "marketing" | "content" | "analysis" | "social" | "creative";

/** A pluggable AI capability. `I` is the request shape, `O` the validated result. */
export interface Skill<I, O> {
  /** matches the `// llm-tool: <id>` tag + the gate registry entry */
  id: string;
  label: string;
  category: SkillCategory;
  /** system prompt (stable per skill — part of the contract fingerprint) */
  system: string;
  /** @google/genai Type-form schema (the other half of the fingerprint) */
  schema: object;
  temperature?: number;
  /** render the per-request prompt */
  buildPrompt: (input: I) => string;
  /** map raw model JSON → validated typed result */
  normalize: (parsed: unknown) => O;
  /** deterministic fallback when no provider is available */
  demo: (input: I) => O;
  /** optional raw-output domain check (empty = valid) */
  validate?: (parsed: unknown) => string[];
}

/** Adapt a skill + input into the wrapper's GenerateArgs. The resulting object is
 *  spread into a tagged wrapper call site, so the prove-once gate still sees one
 *  tagged call per skill — the SDK adds no untagged chokepoints. */
export function skillToGenerateArgs<I, O>(skill: Skill<I, O>, input: I): GenerateArgs<O> {
  return {
    id: skill.id,
    system: skill.system,
    schema: skill.schema,
    temperature: skill.temperature,
    prompt: skill.buildPrompt(input),
    normalize: skill.normalize,
    demo: () => skill.demo(input),
    validate: skill.validate,
  };
}

/** Structural completeness check — a dynamically-loaded skill must supply every
 *  load-bearing field. Returns human-readable problems (empty = well-formed). */
export function validateSkillShape(skill: Partial<Skill<unknown, unknown>>): string[] {
  const problems: string[] = [];
  if (!skill.id) problems.push("chybí id");
  if (!skill.label) problems.push("chybí label");
  if (!skill.system) problems.push("chybí system prompt");
  if (!skill.schema) problems.push("chybí schema");
  if (typeof skill.buildPrompt !== "function") problems.push("chybí buildPrompt()");
  if (typeof skill.normalize !== "function") problems.push("chybí normalize()");
  if (typeof skill.demo !== "function") problems.push("chybí demo()");
  return problems;
}
