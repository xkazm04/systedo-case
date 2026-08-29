/** Skill marketplace registry with load-time governance. A skill is admitted
 *  only if (a) it's structurally complete and (b) the prove-once gate covers its
 *  id — so the catalog can never fill with broken or unproven AI tools.
 *
 *  GATE_COVERED_SKILL_IDS is the admission list: every id the prove-once gate
 *  (test-llm/registry.mjs) verifies against a real model. That fixture is the SOURCE
 *  OF TRUTH and is read-only from here — but importing it into this server module
 *  would drag the whole test fixture (its @google/genai schema types and every
 *  tool's system prompt) into the production bundle, so instead we MIRROR just its
 *  ids below and pin the mirror with a structural unit test
 *  (test-unit/skills-sdk.test.mjs) that imports the real gate registry and FAILS the
 *  moment this list diverges from it. So the two can never silently diverge (the old
 *  hardcoded 5-id set could, and did — it covered a quarter of the gate), and
 *  admitting any gate-covered tool needs no hand edit here: every id the gate proves
 *  is already admitted. Server-only (skills pull in the tool layer). */
import { validateSkillShape, type Skill, type SkillCategory } from "./types";
import { adsSkill } from "@/lib/ai/tools/ads";
import { briefSkill } from "@/lib/ai/tools/brief";
import { analysisSkill } from "@/lib/ai/tools/analysis";
import { campaignEvalSkill } from "@/lib/ai/tools/campaign-eval";
import { socialSkill } from "@/lib/ai/tools/social";

/** Mirror of the ids in test-llm/registry.mjs (the prove-once gate), in registry
 *  order. The gate fixture is the source of truth; the structural test named above
 *  keeps this array honest. Adding a tool to the gate + this array is all that's
 *  needed for the registry to admit it — no other edit here. */
export const GATE_COVERED_IDS = [
  "ads",
  "brief",
  "analysis",
  "campaign-eval",
  "social",
  "twin-reply",
  "twin-style",
  "repurpose",
  "local-review-reply",
  "article-draft",
  "cohort-diagnosis",
  "keyword-clusters",
  "comparison-outline",
  "lp-variant-ideas",
  "lead-source-diagnosis",
  "ads-diagnosis",
  "local-diagnosis",
  "chat",
  "monthly-recap",
  "channel-research",
  "onboarding-scan",
  "local-page",
  "lp-variant-draft", // W3-B
] as const;

/** The admission set the registry gates on. Derived from GATE_COVERED_IDS so it can
 *  never fall behind the gate the way the old hardcoded set did. */
export const GATE_COVERED_SKILL_IDS = new Set<string>(GATE_COVERED_IDS);

export function isGateCovered(id: string): boolean {
  return GATE_COVERED_SKILL_IDS.has(id);
}

export interface SkillSummary {
  id: string;
  label: string;
  category: SkillCategory;
  covered: boolean;
}

class SkillRegistry {
  private skills = new Map<string, Skill<unknown, unknown>>();

  /** Admit a skill, or throw with the reason it was rejected. The throw is the
   *  governance: a malformed or unproven skill never reaches the catalog. */
  register<I, O>(skill: Skill<I, O>): void {
    const problems = validateSkillShape(skill as Partial<Skill<unknown, unknown>>);
    if (problems.length > 0) {
      throw new Error(`[skills] odmítnut „${skill.id || "?"}": ${problems.join(", ")}.`);
    }
    if (!isGateCovered(skill.id)) {
      throw new Error(
        `[skills] odmítnut „${skill.id}": není pokrytý prove-once gate (chybí v test-llm registru).`
      );
    }
    this.skills.set(skill.id, skill as Skill<unknown, unknown>);
  }

  list(): SkillSummary[] {
    return [...this.skills.values()].map((s) => ({
      id: s.id,
      label: s.label,
      category: s.category,
      covered: isGateCovered(s.id),
    }));
  }
}

export const skillRegistry = new SkillRegistry();

// The core marketing tools, migrated to the SDK shape. Registering them here makes
// GATE_COVERED_SKILL_IDS a contract the code actually keeps: each register() throws
// unless the skill is structurally complete AND covered by the prove-once gate, so
// the registry only ever admits gate-covered tools — a SUBSET of GATE_COVERED_SKILL_IDS
// (the five core tools migrated to the SDK so far). As more tools migrate they register
// here with no edit to the admission list above. Importing this module (e.g. by the
// /api/skills diagnostics route) runs this governance.
skillRegistry.register(adsSkill);
skillRegistry.register(briefSkill);
skillRegistry.register(analysisSkill);
skillRegistry.register(campaignEvalSkill);
skillRegistry.register(socialSkill);
