/** "Diagnóza týdne" runner (Direction 2, server-only): during the weekly digest,
 *  run BOTH gate-tracked diagnosis tools over a tenant's real (per-project) data —
 *  reusing the EXISTING tools + their extracted request builders, so there is NO new
 *  LLM operation and the gate fingerprints are unchanged — persist each result
 *  through the Direction-1 store (origin "digest") so the module shows it too, and
 *  return a compact summary for the alert-inbox entry + the email section.
 *
 *  Spend posture: mirrors /api/ai's cachedRespond — one global-ceiling unit is
 *  charged per intended provider call up front and refunded when a call degrades to
 *  the deterministic demo (no paid provider ran) or throws, so passive digest AI
 *  respects the same AI_GLOBAL_DAILY_CEILING guard as interactive calls. The caller
 *  (the cron) has already gated on shouldRunWeeklyDiagnosis (once/week + skip
 *  sample-only), so this just does the work. */
import "server-only";
import { generateCohortDiagnosis, generateLeadSourceDiagnosis } from "@/lib/ai/tools";
import { cohortsForProject } from "@/lib/ltv/sample";
import { ltvSummary, withMetrics as cohortWithMetrics } from "@/lib/ltv/compute";
import { sourcesForProject } from "@/lib/lead-quality/sample";
import { withMetrics as sourceWithMetrics } from "@/lib/lead-quality/compute";
import { buildCohortRequest } from "./cohort-request";
import { buildLeadSourceSeeds, seedToRequest } from "./lead-source-request";
import { buildStoredDiagnosis, inputDigest, sanitizeDiagnosisInput } from "./types";
import { recordDiagnosis } from "./store";
import { durableGuard, refundGlobalSpend } from "@/lib/ai/durable-limit";
import { enterLlmRequestContext } from "@/lib/llm/request-context";
import type { Project } from "@/lib/projects/types";
import type { SupportedLocale } from "@/lib/format";
import type { AiResponse, CohortDiagnosisResult, LeadSourceDiagnosisResult } from "@/lib/ai-types";

/** One diagnosis's compact output for the alert / email. */
export interface DigestDiagnosisPart {
  subject: string;
  summary: string;
  recommendation: string;
}

export interface DigestDiagnosisResult {
  cohort?: DigestDiagnosisPart;
  leadSource?: DigestDiagnosisPart;
}

/** Refund the global-ceiling unit when a call degraded to the demo (no paid work). */
async function refundIfDemo(res: AiResponse<unknown>): Promise<void> {
  if (res.meta?.demo) await refundGlobalSpend(1);
}

/**
 * Run + persist both diagnoses for a project's tenant. Returns the compact summary,
 * or null when nothing produced (e.g. the tenant has no diagnosable data). The
 * digest emails are Czech, so the tools run with the `cs` locale.
 */
export async function runTenantDiagnoses(
  project: Project,
  now: Date = new Date()
): Promise<DigestDiagnosisResult | null> {
  const locale: SupportedLocale = "cs";
  const eshop = project.type === "eshop";

  // Build the SAME requests the panels build, from the project's real data.
  const cohorts = cohortsForProject(project);
  const cohortRows = cohorts.map((c) => cohortWithMetrics(c));
  const cohortReq = buildCohortRequest(cohortRows, ltvSummary(cohorts), eshop);

  const sourceRows = sourcesForProject(project)
    .map(sourceWithMetrics)
    .sort((a, b) => b.qualityScore - a.qualityScore);
  const seeds = buildLeadSourceSeeds(sourceRows);
  const leadSeed = seeds[0];

  const hasCohort = cohortReq.cohorts.length > 0;
  const hasLead = leadSeed != null;
  if (!hasCohort && !hasLead) return null;

  // Attribute the telemetry to the project (mirrors the /api/ai request context).
  enterLlmRequestContext({ projectId: project.id });

  // Charge the global ceiling for the intended provider calls; skip on exhaustion.
  const intended = (hasCohort ? 1 : 0) + (hasLead ? 1 : 0);
  const guard = await durableGuard("cron:digest-diagnosis", [], { spendUnits: intended });
  if (!guard.ok) return null;

  const out: DigestDiagnosisResult = {};

  if (hasCohort) {
    try {
      const res = await generateCohortDiagnosis(cohortReq, locale);
      await refundIfDemo(res);
      await persistCohort(project.id, res.result, cohortReq, now);
      out.cohort = {
        subject: res.result.worstCohort,
        summary: res.result.summary,
        recommendation: res.result.recommendation,
      };
    } catch (err) {
      await refundGlobalSpend(1); // no billable work landed
      console.error(`[cron] cohort diagnosis failed for ${project.id}:`, err);
    }
  }

  if (hasLead) {
    try {
      const leadReq = seedToRequest(leadSeed);
      const res = await generateLeadSourceDiagnosis(leadReq, locale);
      await refundIfDemo(res);
      await persistLeadSource(project.id, res.result, leadReq, leadSeed.source, now);
      out.leadSource = {
        subject: leadSeed.source,
        summary: res.result.summary,
        recommendation: res.result.recommendation,
      };
    } catch (err) {
      await refundGlobalSpend(1);
      console.error(`[cron] lead-source diagnosis failed for ${project.id}:`, err);
    }
  }

  return out.cohort || out.leadSource ? out : null;
}

async function persistCohort(
  projectId: string,
  result: CohortDiagnosisResult,
  req: unknown,
  now: Date
): Promise<void> {
  const input = sanitizeDiagnosisInput({
    kind: "cohort",
    result,
    inputDigest: inputDigest(req),
    subject: result.worstCohort,
    origin: "digest",
  });
  if (!input) return;
  await recordDiagnosis(projectId, buildStoredDiagnosis(input, () => crypto.randomUUID(), now));
}

async function persistLeadSource(
  projectId: string,
  result: LeadSourceDiagnosisResult,
  req: unknown,
  subject: string,
  now: Date
): Promise<void> {
  const input = sanitizeDiagnosisInput({
    kind: "lead-source",
    result,
    inputDigest: inputDigest(req),
    subject,
    origin: "digest",
  });
  if (!input) return;
  await recordDiagnosis(projectId, buildStoredDiagnosis(input, () => crypto.randomUUID(), now));
}
