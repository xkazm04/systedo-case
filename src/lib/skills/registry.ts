/** Skill marketplace registry with load-time governance. A skill is admitted
 *  only if (a) it's structurally complete and (b) the prove-once gate covers its
 *  id — so the catalog can never fill with broken or unproven AI tools. The set
 *  of gate-covered ids mirrors test-llm/registry.mjs; the gate's coverage check
 *  keeps the two in sync (an id here without a real call site fails the gate).
 *  Server-only (skills pull in the tool layer). */
import { validateSkillShape, type Skill, type SkillCategory } from "./types";
import { adsSkill } from "@/lib/ai/tools/ads";

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

  /** Graceful variant for untrusted/3rd-party skills — never throws. */
  tryRegister<I, O>(skill: Skill<I, O>): { ok: boolean; error?: string } {
    try {
      this.register(skill);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  get(id: string): Skill<unknown, unknown> | undefined {
    return this.skills.get(id);
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

// Built-in reference plugin: the ads tool, migrated to the SDK shape.
skillRegistry.register(adsSkill);
