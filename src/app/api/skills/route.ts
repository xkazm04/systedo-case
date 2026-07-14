/** AI skill registry — dev/diagnostics surface (NOT a user-facing marketplace):
 *   GET → the registered, gate-covered skills on this install + the gate-covered set.
 *  Importing the registry is what RUNS its load-time governance: every core skill is
 *  registered here, and registration throws unless the skill is structurally complete
 *  and covered by the prove-once gate — so hitting this route is also a live check
 *  that the registry's contract holds (the admitted set equals the gate-covered set).
 *  Node runtime. */
import { skillRegistry, GATE_COVERED_SKILL_IDS } from "@/lib/skills/registry";


export async function GET() {
  return Response.json({
    skills: skillRegistry.list(),
    gateCovered: [...GATE_COVERED_SKILL_IDS],
  });
}
