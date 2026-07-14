/** Skill marketplace registry with load-time governance. A skill is admitted
 *  only if (a) it's structurally complete and (b) the prove-once gate covers its
 *  id — so the catalog can never fill with broken or unproven AI tools. The set
 *  of gate-covered ids mirrors test-llm/registry.mjs; the gate's coverage check
 *  keeps the two in sync (an id here without a real call site fails the gate).
 *  Server-only (skills pull in the tool layer). */
import { validateSkillShape, type Skill, type SkillCategory } from "./types";
import { adsSkill } from "@/lib/ai/tools/ads";
import { briefSkill } from "@/lib/ai/tools/brief";
import { analysisSkill } from "@/lib/ai/tools/analysis";
import { campaignEvalSkill } from "@/lib/ai/tools/campaign-eval";
import { socialSkill } from "@/lib/ai/tools/social";

/** Ids the prove-once gate verifies against a real model. Source of truth is the
 *  gate (test-llm); kept here as the admission list for the registry. */
export const GATE_COVERED_SKILL_IDS = new Set(["ads", "brief", "analysis", "campaign-eval", "social"]);

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
// the admitted set below can only ever equal the gate-covered set. Importing this
// module (e.g. by the /api/skills diagnostics route) runs this governance.
skillRegistry.register(adsSkill);
skillRegistry.register(briefSkill);
skillRegistry.register(analysisSkill);
skillRegistry.register(campaignEvalSkill);
skillRegistry.register(socialSkill);
