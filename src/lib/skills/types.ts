/** AI Skill SDK — the contract that turns the single generateStructured
 *  chokepoint into an extensible plugin surface. A skill is a self-contained,
 *  testable unit (id, schema, prompt builder, normalizer, deterministic demo,
 *  optional validator). The registry refuses to load any skill that the
 *  prove-once gate doesn't cover, so quality is enforced by construction. Pure —
 *  only a type import from the wrapper (erased), safe to import anywhere. */
import type { GenerateArgs } from "@/lib/llm";

export type SkillCategory = "marketing" | "content" | "analysis" | "social" | "creative";

/** A pluggable AI capability. `I` is the request shape, `O` the validated result.
 *
 *  `system` and `normalize` are input-aware so the contract is genuinely generic —
 *  it fits the tools whose system prompt is grounded per-request (social's brand
 *  persona) and whose normalizer needs the request shape (social fills the
 *  platforms the model skipped). A skill with a fixed system prompt and an
 *  input-independent normalizer (ads, brief, analysis, campaign-eval) simply
 *  supplies a plain string and a one-arg function — both remain assignable. */
export interface Skill<I, O> {
  /** matches the `// llm-tool: <id>` tag + the gate registry entry */
  id: string;
  label: string;
  category: SkillCategory;
  /** system prompt (part of the contract fingerprint). A string for a stable
   *  persona, or a function of the input when the persona is grounded per request
   *  (e.g. the brand a social post is written for). The gate/golden fingerprints
   *  the brand-less base, so a grounded system prompt stays gate-covered. */
  system: string | ((input: I) => string);
  /** @google/genai Type-form schema (the other half of the fingerprint) */
  schema: object;
  temperature?: number;
  /** render the per-request prompt */
  buildPrompt: (input: I) => string;
  /** map raw model JSON → validated typed result. Receives the request `input` too,
   *  so a normalizer can reconcile the output against what was asked (e.g. fill any
   *  platform the model skipped). Input-independent normalizers ignore the 2nd arg. */
  normalize: (parsed: unknown, input: I) => O;
  /** deterministic fallback when no provider is available */
  demo: (input: I) => O;
  /** optional raw-output domain check (empty = valid) */
  validate?: (parsed: unknown) => string[];
}

/** Adapt a skill + input into the wrapper's GenerateArgs. The resulting object is
 *  spread into a tagged wrapper call site, so the prove-once gate still sees one
 *  tagged call per skill — the SDK adds no untagged chokepoints. The input-aware
 *  `system`/`normalize` are bound to THIS input here, so the wrapper still sees the
 *  plain `(string, (parsed) => O)` shape it always has. */
export function skillToGenerateArgs<I, O>(skill: Skill<I, O>, input: I): GenerateArgs<O> {
  return {
    id: skill.id,
    system: typeof skill.system === "function" ? skill.system(input) : skill.system,
    schema: skill.schema,
    temperature: skill.temperature,
    prompt: skill.buildPrompt(input),
    normalize: (parsed) => skill.normalize(parsed, input),
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
