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
 *  Wave 1 adds the ADS arm on the same terms, for the (common) tenant whose only
 *  live data is its synced ad accounts: it runs over the project's campaign UNION
 *  (ADR-0010) when a genuinely synced portfolio actually spent in the window, and is
 *  skipped with an honest note otherwise. The arms are independent — a tenant with
 *  both live funnels gets both diagnoses and is charged one unit for each.
 *
 *  Spend posture: mirrors /api/ai's cachedRespond — one global-ceiling unit is
 *  charged per intended provider call and refunded when a call degrades to the
 *  deterministic demo (no paid provider ran) or throws. Nothing is charged when no
 *  diagnosis runs. */
import "server-only";
import { generateLeadSourceDiagnosis } from "@/lib/ai/tools";
// Imported from its own module rather than the ./tools barrel (which is outside this
// work package's write set); the barrel would re-export exactly this.
import { generateAdsDiagnosis } from "@/lib/ai/tools/ads-diagnosis";
import { sourcesForProject } from "@/lib/lead-quality/sample";
import { withMetrics as sourceWithMetrics } from "@/lib/lead-quality/compute";
import { resolveLeadSources } from "@/lib/lead-quality/resolve";
import { buildLeadSourceSeeds, seedToRequest } from "./lead-source-request";
import { adsDiagnosisSubject } from "./ads-request";
import { resolveAdsDiagnosisRequest } from "./resolve-request";
import { planDigestDiagnoses } from "./digest-plan";
import { extractAdsSnapshot, extractLeadSourceSnapshot } from "./outcome";
import {
  buildStoredDiagnosis,
  inputDigest,
  sanitizeDiagnosisInput,
  type DiagnosisKind,
  type DiagnosisResult,
} from "./types";
import { recordDiagnosis } from "./store";
import { durableGuard, refundGlobalSpend } from "@/lib/ai/durable-limit";
import { enterLlmRequestContext } from "@/lib/llm/request-context";
import type { Project } from "@/lib/projects/types";
import type { SupportedLocale } from "@/lib/format";
import type { AiResponse, DiagnosisSnapshot } from "@/lib/ai-types";

/** One diagnosis's compact output for the alert / email. */
export interface DigestDiagnosisPart {
  subject: string;
  summary: string;
  recommendation: string;
}

export interface DigestDiagnosisResult {
  leadSource?: DigestDiagnosisPart;
  /** the ads-performance diagnosis, when the ads arm ran */
  ads?: DigestDiagnosisPart;
  /** honest run/skip notes for the run record (e.g. "cohort: no live basis") */
  notes: string[];
}

/** Refund the global-ceiling unit when a call degraded to the demo (no paid work). */
async function refundIfDemo(res: AiResponse<unknown>): Promise<void> {
  if (res.meta?.demo) await refundGlobalSpend(1);
}

/**
 * Run + persist the passive diagnoses a project's tenant can honestly support this
 * pass — the lead-source arm on genuinely imported leads, the ads arm on a genuinely
 * synced portfolio that actually spent — and return the compact parts plus the skip
 * notes. `userId` scopes the ads read to the caller's OWN tenants (the tenant key
 * embeds it); omitted, the ads arm resolves nothing and is skipped with its note.
 * The digest emails are Czech, so the tools run with the `cs` locale.
 */
export async function runTenantDiagnoses(
  project: Project,
  now: Date = new Date(),
  userId: string | null = null
): Promise<DigestDiagnosisResult> {
  const locale: SupportedLocale = "cs";

  // Resolve the funnel's ACTUAL source set (imported-over-sample) and build the
  // SAME seeds the panel builds — from real data, never the sample generator.
  const resolved = await resolveLeadSources(project.id, sourcesForProject(project));
  const sourceRows = resolved.sources
    .map(sourceWithMetrics)
    .sort((a, b) => b.qualityScore - a.qualityScore);
  const leadSeed = buildLeadSourceSeeds(sourceRows)[0];

  // The ads request is rebuilt by the SAME server resolver the click path uses, so
  // the passive and the on-demand diagnosis read identical numbers. A store hiccup
  // degrades to "no ads basis" (the note), never to a fabricated portfolio.
  const adsResolved = await resolveAdsDiagnosisRequest(project, userId).catch((err) => {
    console.error(`[cron] ads diagnosis resolve failed for ${project.id}:`, err);
    return null;
  });

  const plan = planDigestDiagnoses({
    leadSourcesLive: resolved.live,
    hasLeadSeed: leadSeed != null,
    adsLive: adsResolved != null && !adsResolved.sample,
    // Spend ANYWHERE in the portfolio counts, asked of each network in turn — the
    // per-network figures are never summed across currencies (ADR-0010).
    adsHasSignal: adsResolved != null && adsResolved.request.platforms.some((p) => p.cost > 0),
  });
  const out: DigestDiagnosisResult = { notes: plan.notes };
  const runLead = plan.runLead && leadSeed != null;
  const runAds = plan.runAds && adsResolved != null;
  if (!runLead && !runAds) return out;

  // Attribute the telemetry to the project (mirrors the /api/ai request context).
  enterLlmRequestContext({ projectId: project.id });

  if (runLead && leadSeed) {
    // Charge the global ceiling for the one intended provider call; skip on exhaustion.
    const guard = await durableGuard("cron:digest-diagnosis", [], { spendUnits: 1 });
    if (guard.ok) {
      try {
        const leadReq = seedToRequest(leadSeed);
        const res = await generateLeadSourceDiagnosis(leadReq, locale);
        await refundIfDemo(res);
        await persistDiagnosis(
          "lead-source",
          project.id,
          res.result,
          leadReq,
          leadSeed.source,
          extractLeadSourceSnapshot(leadReq),
          now
        );
        out.leadSource = {
          subject: leadSeed.source,
          summary: res.result.summary,
          recommendation: res.result.recommendation,
        };
      } catch (err) {
        await refundGlobalSpend(1); // no billable work landed
        console.error(`[cron] lead-source diagnosis failed for ${project.id}:`, err);
      }
    }
  }

  if (runAds && adsResolved) {
    // A SECOND unit: two diagnoses are two provider calls, so each carries its own
    // guard + refund rather than riding the other arm's charge.
    const guard = await durableGuard("cron:digest-diagnosis", [], { spendUnits: 1 });
    if (guard.ok) {
      const adsReq = adsResolved.request;
      const subject = adsDiagnosisSubject(adsReq);
      try {
        const res = await generateAdsDiagnosis(adsReq, locale);
        await refundIfDemo(res);
        // The STORED subject of a portfolio diagnosis is the cause it settled on
        // (what the panel echoes too, so both paths agree); `subject` above is the
        // costliest campaign's name, which is what reads well in the alert/email.
        await persistDiagnosis(
          "ads",
          project.id,
          res.result,
          adsReq,
          res.result.likelyCause,
          extractAdsSnapshot(adsReq),
          now
        );
        out.ads = {
          subject,
          summary: res.result.summary,
          recommendation: res.result.recommendation,
        };
      } catch (err) {
        await refundGlobalSpend(1); // no billable work landed
        console.error(`[cron] ads diagnosis failed for ${project.id}:`, err);
      }
    }
  }

  return out;
}

/** Persist one produced diagnosis under its kind. Generalised from the lead-only
 *  writer so every arm shares the SAME wire coercion, the SAME digest of the request
 *  it was computed from, and the SAME server-stamped provenance.
 *
 *  Direction 1: `snapshot` is the at-diagnosis key-metric value, so a digest-origin
 *  diagnosis also carries an outcome to compare against later. */
async function persistDiagnosis(
  kind: DiagnosisKind,
  projectId: string,
  result: DiagnosisResult,
  req: unknown,
  subject: string,
  snapshot: DiagnosisSnapshot | null,
  now: Date
): Promise<void> {
  const input = sanitizeDiagnosisInput(
    {
      kind,
      result,
      inputDigest: inputDigest(req),
      subject,
      ...(snapshot ? { snapshot } : {}),
    },
    // The cron is the only legitimate "digest" writer; the sanitizer ignores any
    // wire-supplied origin, so the provenance is stamped here, server-side.
    { origin: "digest" }
  );
  if (!input) return;
  await recordDiagnosis(projectId, buildStoredDiagnosis(input, () => crypto.randomUUID(), now));
}
