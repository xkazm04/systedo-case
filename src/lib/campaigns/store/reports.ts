/** The tenant's AI-report store plus caching (server-only): persists each LLM
 *  evaluation, exposes the latest-per-scope reads, the deterministic input
 *  fingerprint for cache lookups, and the score-drop regression alert. */
import "server-only";
import { createHash } from "node:crypto";
import { tenantDoc } from "./tenant";
import { recordActivity } from "../activity";
import { recordAlert } from "../alerts";
import type {
  AiResponse,
  CampaignReport,
  CampaignReportResult,
  EvalScope,
  ReportHistoryPoint,
} from "../../ai-types";
import type { Campaign, CampaignPeriod } from "../types";

interface ReportDoc {
  scope: string;
  campaign_id: string | null;
  period: string;
  model: string;
  demo: boolean;
  payload: CampaignReportResult;
  prompt: string;
  took_ms: number;
  created_at: string;
  input_hash?: string | null;
}

function toReport(r: ReportDoc): CampaignReport {
  return {
    scope: r.scope as EvalScope,
    campaignId: r.campaign_id,
    period: r.period,
    result: r.payload,
    meta: { model: r.model, demo: Boolean(r.demo), prompt: r.prompt, tookMs: Number(r.took_ms) },
    createdAt: r.created_at,
  };
}

function toHistoryPoint(r: ReportDoc): ReportHistoryPoint {
  return {
    score: r.payload.score,
    verdict: r.payload.verdict,
    period: r.period,
    demo: Boolean(r.demo),
    createdAt: r.created_at,
  };
}

/** All of a tenant's reports, oldest → newest. */
async function allReports(tenant: string): Promise<ReportDoc[]> {
  const snap = await tenantDoc(tenant).collection("reports").orderBy("created_at", "asc").get();
  return snap.docs.map((d) => d.data() as ReportDoc);
}

const reportKey = (r: ReportDoc): string =>
  r.scope === "overall" ? "overall" : r.campaign_id ?? "overall";

/** A score falling by at least this many points between two consecutive stored
 *  evaluations of the same scope raises a critical inbox alert — the report
 *  history stops being write-only and becomes proactive monitoring. */
export const SCORE_DROP_ALERT_POINTS = 15;

export async function saveReport(
  tenant: string,
  args: {
    scope: EvalScope;
    campaignId: string | null;
    period: CampaignPeriod;
    response: AiResponse<CampaignReportResult>;
    inputHash?: string;
  }
): Promise<CampaignReport> {
  const { scope, campaignId, period, response, inputHash } = args;
  const createdAt = new Date().toISOString();
  const doc: ReportDoc = {
    scope,
    campaign_id: campaignId,
    period,
    model: response.meta.model,
    demo: response.meta.demo,
    payload: response.result,
    prompt: response.meta.prompt,
    took_ms: response.meta.tookMs,
    created_at: createdAt,
    input_hash: inputHash ?? null,
  };

  // Previous point of this scope's history (same filter getReportHistory uses),
  // read before the new report lands so the regression check has its baseline.
  // Best-effort: a failed read only skips the alert, never the save.
  let previous: ReportDoc | null = null;
  try {
    const history = (await allReports(tenant)).filter(
      (r) => r.scope === scope && (r.campaign_id ?? "") === (campaignId ?? "")
    );
    previous = history[history.length - 1] ?? null;
  } catch {
    previous = null;
  }

  await tenantDoc(tenant).collection("reports").add(doc);

  // Proactive monitoring on the write seam (the gate-locked analyze route needs
  // no edit): a timeline entry per evaluation — AI spend becomes auditable —
  // plus a critical inbox alert on a significant score collapse. Demo-mode
  // reports carry canned scores, so a demo report neither raises nor baselines
  // the regression alert. Both wrapped so logging can never fail the evaluation.
  try {
    const scopeLabel = scope === "overall" ? "celé portfolio" : `kampaň ${campaignId}`;
    await recordActivity(tenant, {
      kind: "report",
      title: `AI vyhodnocení · skóre ${response.result.score}`,
      detail: `${scopeLabel} · období ${period} · ${response.result.verdict}`,
    });

    const drop = previous ? previous.payload.score - response.result.score : 0;
    if (previous && !previous.demo && !response.meta.demo && drop >= SCORE_DROP_ALERT_POINTS) {
      await recordAlert(tenant, {
        type: "critical",
        title: `AI skóre kleslo o ${drop} bodů (${previous.payload.score} → ${response.result.score})`,
        body: `${scopeLabel} · ${response.result.verdict}`,
        items: [
          {
            campaignId: campaignId ?? "overall",
            name: scopeLabel,
            reason: `Skóre kleslo z ${previous.payload.score} na ${response.result.score} mezi dvěma vyhodnoceními (práh ${SCORE_DROP_ALERT_POINTS} b.).`,
          },
        ],
      });
    }
  } catch (err) {
    console.error(`[campaigns] report activity/alert failed for ${tenant} (non-fatal):`, err);
  }

  return { scope, campaignId, period, result: response.result, meta: response.meta, createdAt };
}

/** Latest report per (scope, campaign) for a period. */
export async function getReportsForPeriod(
  tenant: string,
  period: CampaignPeriod
): Promise<Record<string, CampaignReport>> {
  return (await getReportsForPeriodWithHashes(tenant, period)).reports;
}

/** Latest report per key for a period PLUS each report's stored input hash, so
 *  the GET state can compare it against the current `hashEvalInputs` and flag
 *  reports whose underlying data changed after they were generated (`toReport`
 *  deliberately drops the hash from the client payload). Reports saved before
 *  input hashing existed carry `null`. */
export async function getReportsForPeriodWithHashes(
  tenant: string,
  period: CampaignPeriod
): Promise<{ reports: Record<string, CampaignReport>; inputHashes: Record<string, string | null> }> {
  const reports: Record<string, CampaignReport> = {};
  const inputHashes: Record<string, string | null> = {};
  // asc order → last write for a key wins = the latest report.
  for (const r of await allReports(tenant)) {
    if (r.period !== period) continue;
    const key = reportKey(r);
    reports[key] = toReport(r);
    inputHashes[key] = r.input_hash ?? null;
  }
  return { reports, inputHashes };
}

/** Deterministic fingerprint of the exact inputs an evaluation depends on.
 *  `changesCurrent` (ChangesSummary.current — the diff's sync marker) is folded
 *  in when supplied: the prompts now embed the sync-over-sync diff, so a cached
 *  report must be invalidated when the diff moves even if the campaign tuples
 *  happen to match. Omitted/null keeps the legacy hash byte-identical. */
export function hashEvalInputs(
  scope: EvalScope,
  campaignId: string | null,
  period: CampaignPeriod,
  campaigns: Campaign[],
  changesCurrent?: string | null
): string {
  const inScope =
    scope === "campaign"
      ? campaigns.filter((c) => c.id === campaignId)
      : [...campaigns].sort((a, b) => a.id.localeCompare(b.id));
  const tuples = inScope.map(
    (c) =>
      `${c.id}:${c.status}:${c.impressions}:${c.clicks}:${c.cost}:${c.conversions}:${c.conversionValue}`
  );
  const changesPart = changesCurrent ? `|chg:${changesCurrent}` : "";
  return createHash("sha1")
    .update(`${scope}|${campaignId ?? ""}|${period}|${tuples.join(";")}${changesPart}`)
    .digest("hex");
}

/** The newest stored report matching the input fingerprint, or null. */
export async function findCachedReport(
  tenant: string,
  scope: EvalScope,
  campaignId: string | null,
  period: CampaignPeriod,
  inputHash: string
): Promise<CampaignReport | null> {
  const matches = (await allReports(tenant)).filter(
    (r) =>
      r.scope === scope &&
      (r.campaign_id ?? "") === (campaignId ?? "") &&
      r.period === period &&
      r.input_hash === inputHash
  );
  return matches.length ? toReport(matches[matches.length - 1]!) : null;
}

export async function getReportHistory(
  tenant: string,
  scope: EvalScope,
  campaignId: string | null
): Promise<ReportHistoryPoint[]> {
  return (await allReports(tenant))
    .filter((r) => r.scope === scope && (r.campaign_id ?? "") === (campaignId ?? ""))
    .map(toHistoryPoint);
}

export async function getReportHistories(
  tenant: string
): Promise<Record<string, ReportHistoryPoint[]>> {
  const out: Record<string, ReportHistoryPoint[]> = {};
  for (const r of await allReports(tenant)) {
    (out[reportKey(r)] ??= []).push(toHistoryPoint(r));
  }
  return out;
}
