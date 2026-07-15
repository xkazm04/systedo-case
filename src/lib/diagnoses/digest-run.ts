/** "Diagnóza týdne" runner (server-only): during the weekly digest, run the
 *  gate-tracked lead-source diagnosis over a tenant's REAL resolved data — reusing
 *  the EXACT request builder the panel path uses (lead-source-request.ts), so there
 *  is NO new LLM operation and the gate fingerprints are unchanged. The result is
 *  persisted through the Direction-1 store (origin "digest") so the module shows it
 *  too, and a compact summary is returned for the alert-inbox entry + the email.
 *
 *  Integrity (Direction 1): the lead-source diagnosis runs ONLY when the funnel
 *  resolves to genuinely imported leads (resolveLeadSources.live) — a connected
 *  tenant WITHOUT imported leads now gets NO synthetic diagnosis. The cohort
 *  diagnosis is skipped honestly (no live cohort store): no LLM call, no spend, a
 *  recorded note. Sample-only tenants were already gated out by the cron.
 *
 *  Spend posture: mirrors /api/ai's cachedRespond — one global-ceiling unit is
 *  charged per intended provider call and refunded when a call degrades to the
 *  deterministic demo (no paid provider ran) or throws. Nothing is charged when no
 *  diagnosis runs. */
import "server-only";
import { generateLeadSourceDiagnosis } from "@/lib/ai/tools";
import { sourcesForProject } from "@/lib/lead-quality/sample";
import { withMetrics as sourceWithMetrics } from "@/lib/lead-quality/compute";
import { resolveLeadSources } from "@/lib/lead-quality/resolve";
import { buildLeadSourceSeeds, seedToRequest } from "./lead-source-request";
import { planDigestDiagnoses } from "./digest-plan";
import { extractLeadSourceSnapshot } from "./outcome";
import { buildStoredDiagnosis, inputDigest, sanitizeDiagnosisInput } from "./types";
import { recordDiagnosis } from "./store";
import { durableGuard, refundGlobalSpend } from "@/lib/ai/durable-limit";
import { enterLlmRequestContext } from "@/lib/llm/request-context";
import type { Project } from "@/lib/projects/types";
import type { SupportedLocale } from "@/lib/format";
import type { AiResponse, LeadSourceDiagnosisRequest, LeadSourceDiagnosisResult } from "@/lib/ai-types";

/** One diagnosis's compact output for the alert / email. */
export interface DigestDiagnosisPart {
  subject: string;
  summary: string;
  recommendation: string;
}

export interface DigestDiagnosisResult {
  leadSource?: DigestDiagnosisPart;
  /** honest run/skip notes for the run record (e.g. "cohort: no live basis") */
  notes: string[];
}

/** Refund the global-ceiling unit when a call degraded to the demo (no paid work). */
async function refundIfDemo(res: AiResponse<unknown>): Promise<void> {
  if (res.meta?.demo) await refundGlobalSpend(1);
}

/**
 * Run + persist the lead-source diagnosis for a project's tenant when its funnel
 * resolves to genuinely imported leads; otherwise return only the honest skip
 * notes. The digest emails are Czech, so the tool runs with the `cs` locale.
 */
export async function runTenantDiagnoses(
  project: Project,
  now: Date = new Date()
): Promise<DigestDiagnosisResult> {
  const locale: SupportedLocale = "cs";

  // Resolve the funnel's ACTUAL source set (imported-over-sample) and build the
  // SAME seeds the panel builds — from real data, never the sample generator.
  const resolved = await resolveLeadSources(project.id, sourcesForProject(project));
  const sourceRows = resolved.sources
    .map(sourceWithMetrics)
    .sort((a, b) => b.qualityScore - a.qualityScore);
  const leadSeed = buildLeadSourceSeeds(sourceRows)[0];

  const plan = planDigestDiagnoses({
    leadSourcesLive: resolved.live,
    hasLeadSeed: leadSeed != null,
  });
  const out: DigestDiagnosisResult = { notes: plan.notes };
  if (!plan.runLead || !leadSeed) return out;

  // Attribute the telemetry to the project (mirrors the /api/ai request context).
  enterLlmRequestContext({ projectId: project.id });

  // Charge the global ceiling for the one intended provider call; skip on exhaustion.
  const guard = await durableGuard("cron:digest-diagnosis", [], { spendUnits: 1 });
  if (!guard.ok) return out;

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
    await refundGlobalSpend(1); // no billable work landed
    console.error(`[cron] lead-source diagnosis failed for ${project.id}:`, err);
  }

  return out;
}

async function persistLeadSource(
  projectId: string,
  result: LeadSourceDiagnosisResult,
  req: LeadSourceDiagnosisRequest,
  subject: string,
  now: Date
): Promise<void> {
  const input = sanitizeDiagnosisInput({
    kind: "lead-source",
    result,
    inputDigest: inputDigest(req),
    subject,
    origin: "digest",
    // Direction 1: capture the at-diagnosis key-metric snapshot (the source's qualRate)
    // so a digest-origin diagnosis also carries an outcome to compare against later.
    snapshot: extractLeadSourceSnapshot(req),
  });
  if (!input) return;
  await recordDiagnosis(projectId, buildStoredDiagnosis(input, () => crypto.randomUUID(), now));
}
