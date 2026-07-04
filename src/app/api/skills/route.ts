/** AI skill marketplace catalog:
 *   GET → the registered, gate-covered skills available on this install.
 *  Importing the registry triggers built-in skill registration; only skills the
 *  prove-once gate covers are admitted, so this list is "what's safe to run".
 *  Node runtime. */
import { skillRegistry, GATE_COVERED_SKILL_IDS } from "@/lib/skills/registry";


export async function GET() {
  return Response.json({
    skills: skillRegistry.list(),
    gateCovered: [...GATE_COVERED_SKILL_IDS],
  });
}
