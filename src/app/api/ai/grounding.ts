/** Grounding resolvers for the /api/ai mode table — the store-touching half.
 *
 *  These are the impure inputs the descriptor table (./modes) injects via `ModeDeps`
 *  and route.ts wires into `realDeps`. They live in their own module (not in
 *  ./modes) precisely so the descriptor table stays free of the Firestore / session
 *  import graph and remains unit-testable with fakes.
 *
 *  The four resolvers each used to inline the SAME demo-public / owner-only tenancy
 *  triad; that copy is gone — they all call the single `resolveProjectAccess` helper
 *  and branch on its `kind`. */
import type { SupportedLocale } from "@/lib/format";
import type { PerformanceData } from "@/lib/types";
import type { ProjectType, Project } from "@/lib/projects/types";
import type { AnalysisPeriod } from "@/lib/ai-types";
import { getProject } from "@/lib/projects/store";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { resolveReportDataset } from "@/lib/report-metrics/resolve";
import { staleCaveatText } from "@/lib/report-metrics/freshness";
import { loadBrandContext } from "@/lib/brand/load";
import { buildSnapshot } from "@/lib/snapshot";
import { resolveLeadSignals, resolveLeadSignalsPromptText } from "@/lib/lead-signals/summary";
import { localSignalsPromptText } from "@/lib/local-signals/summary";
import { getCompetitors } from "@/lib/competitors/store";
import { competitorGroundingText } from "@/lib/competitors/grounding";
import { getCostModel } from "@/lib/cost-model/store";
import { profitGroundingText, historyGroundingText } from "@/lib/report/recap-context";
import { getAnnotations } from "@/lib/annotations/store";
import { annotationsGroundingText } from "@/lib/annotations/types";
import { resolveTenant } from "@/lib/campaigns/connector";
import { getClientProfile } from "@/lib/campaigns/report-config";
import { getPatternLines } from "@/lib/patterns/store";
import { adPatternQuery } from "@/lib/patterns/query";
import { DEMO_PROJECTS } from "@/lib/demo/projects";

// ─── tenancy triad, resolved ONCE ────────────────────────────────────────────────

/** The demo-public / owner-only project resolution every grounded op shares. A demo
 *  id is public; a real id must belong to the caller. Returns WHICH project the
 *  grounding may read (or none) — callers branch on `kind` for their own per-op
 *  derivation (demo uses the sample spine, owned resolves live Ads data). This is
 *  the single copy of the triad the four resolvers below used to inline. */
export type ProjectAccess =
  | { kind: "none" }
  | { kind: "demo"; project: Project }
  | { kind: "owned"; project: Project };

export async function resolveProjectAccess(
  projectId: string | undefined,
  userId: string | null
): Promise<ProjectAccess> {
  if (!projectId) return { kind: "none" };
  const demo = DEMO_PROJECTS.find((p) => p.id === projectId);
  if (demo) return { kind: "demo", project: demo };
  if (userId) {
    const project = await getProject(userId, projectId);
    if (project) return { kind: "owned", project };
  }
  return { kind: "none" };
}

// ─── grounding resolvers (impure — hit stores; injected into the table) ─────────

/** Czech business-type framing per project type — lets a grounded op (monthly
 *  recap) speak the project's language instead of assuming e-commerce. */
export const BUSINESS_TYPE: Record<ProjectType, string> = {
  eshop: "e-shop (e-commerce)",
  app: "digitální produkt / aplikace",
  leadgen: "generování poptávek (leadgen)",
  content: "obsahový web / publisher",
  local: "lokální podnik / služby",
};

/** The analyzed-window length (days) per recap period, for the annotations block.
 *  Undefined period (e.g. chat) → a 90-day default so recent notes still ground. */
const RECAP_WINDOW_DAYS: Record<AnalysisPeriod, number> = { "30d": 30, "90d": 90, "12m": 365 };
export function windowDaysFor(period?: AnalysisPeriod): number {
  return period ? RECAP_WINDOW_DAYS[period] : 90;
}

export interface GroundingResult {
  data?: PerformanceData;
  keyId: string;
  businessType?: string;
  projectType?: ProjectType;
  groundingContext?: string;
}

/** Combine the recap grounding inputs into one block: lead-signals (C2), the
 *  competitor set (C3), true net profit (A3 cost model) and the 12-month history.
 *  `keySuffix` carries the competitor + cost-model versions so an edit invalidates
 *  the recap cache. */
async function mergeGrounding(
  projectId: string,
  leadText: string | null,
  // R06: map-pack coverage + review sentiment for a local project (null otherwise),
  // resolved by the caller (it needs the project object, not just the id).
  localText: string | null,
  data: PerformanceData | undefined,
  locale: SupportedLocale,
  // Direction 2: the analyzed window (days) for the "Poznámky klienta" annotations
  // block, so only in-window client notes ground the narrative.
  windowDays: number,
  // Profit-trajectory grounding: the recap period, so the profit line covers the
  // ANALYZED window (not a hardcoded 30d) with its net-profit trend direction.
  period?: AnalysisPeriod,
  // Imported-leads version (the import's syncedAt when live, else undefined) so a
  // re-import invalidates the recap cache — the lead grounding text is real data.
  leadVersion?: string
): Promise<{ text?: string; keySuffix?: string }> {
  const [set, costModel, annotations] = await Promise.all([
    getCompetitors(projectId),
    getCostModel(projectId),
    getAnnotations(projectId).catch(() => null),
  ]);
  const merged = [
    leadText,
    localText,
    competitorGroundingText(set, locale),
    profitGroundingText(data, costModel, locale, period),
    historyGroundingText(data, locale, costModel),
    // Direction 2: in-window "what happened here" notes. USER-prompt only (no
    // system-prompt/fingerprint change); "" when there are no in-window notes, so
    // the prompt stays byte-identical for projects without annotations.
    annotationsGroundingText(annotations?.items ?? [], data, windowDays, locale),
  ]
    .filter(Boolean)
    .join(" ");
  const keySuffix = [set?.updatedAt, costModel?.updatedAt, annotations?.updatedAt, leadVersion]
    .filter(Boolean)
    .join("|");
  return { text: merged || undefined, keySuffix: keySuffix || undefined };
}

/** Resolve the dataset a grounded op (chat, monthly recap) reads, with tenancy. A
 *  demo project id is public; a real project id must belong to the caller. `keyId`
 *  keys the response cache by the EFFECTIVE grounding, so an unowned id can never
 *  serve another tenant's cached answer — it degrades to the shared base result.
 *  `businessType` frames per-type recaps (undefined for the base fallback). */
export async function resolveGrounding(
  projectId: string | undefined,
  userId: string | null,
  locale: SupportedLocale,
  // R02: the recap period, so the lead-signals breakdown scales to the SAME period
  // lead total the report tile shows (reconciled tile ↔ narrative). Undefined → the
  // sample totals are left unscaled (callers that don't render a report tile).
  period?: AnalysisPeriod
): Promise<GroundingResult> {
  const access = await resolveProjectAccess(projectId, userId);
  if (access.kind === "none") return { keyId: "base" };
  // The period lead total = the tile's conversion figure (buildSnapshot drives both).
  const targetLeads = (data: PerformanceData) =>
    period ? buildSnapshot(period, "previous", data).current.conversions : undefined;
  if (access.kind === "demo") {
    const demo = access.project;
    const data = getProjectDataset(demo);
    const localText = await localSignalsPromptText(demo, locale);
    const lead = await resolveLeadSignals(demo, targetLeads(data));
    const comp = await mergeGrounding(demo.id, lead.text, localText, data, locale, windowDaysFor(period), period, lead.version);
    return {
      data,
      // C3: the grounding inputs' versions enter the cache key so edits re-generate.
      keyId: comp.keySuffix ? `${demo.id}#${comp.keySuffix}` : demo.id,
      businessType: BUSINESS_TYPE[demo.type],
      // R01: raw type shapes the recap DATA block's metric vocabulary.
      projectType: demo.type,
      // C2 lead-source + C3 competitors + profit/history → deeper recap grounding.
      groundingContext: comp.text,
    };
  }
  // owned
  const project = access.project;
  // A1: ground on the project's LIVE Ads data when synced, else the sample spine.
  // A live sync's timestamp keys the cache so a re-sync serves fresh, not stale.
  const resolved = await resolveReportDataset(project);
  const localText = await localSignalsPromptText(project, locale);
  const lead = await resolveLeadSignals(project, targetLeads(resolved.data));
  const comp = await mergeGrounding(project.id, lead.text, localText, resolved.data, locale, windowDaysFor(period), period, lead.version);
  // D1: when the live series is stale, the recap gets a one-line caveat so the
  // narrative acknowledges the data age instead of presenting month-old numbers
  // as current. USER-prompt only (groundingContext) — no system-prompt / golden
  // fingerprint change. Empty (byte-identical prompt) when fresh or on sample.
  const staleText = resolved.stale ? staleCaveatText(resolved.syncedAt, new Date(), locale) : "";
  // Staleness flips once for a FIXED syncedAt, so it enters the cache key too —
  // a stale request must never be served a fresh-cached answer (or vice-versa).
  const base =
    resolved.live && resolved.syncedAt
      ? `${project.id}@${resolved.syncedAt}${resolved.stale ? "#stale" : ""}`
      : project.id;
  const groundingContext = [comp.text, staleText || null].filter(Boolean).join(" ") || undefined;
  return {
    data: resolved.data,
    keyId: comp.keySuffix ? `${base}#${comp.keySuffix}` : base,
    businessType: BUSINESS_TYPE[project.type],
    projectType: project.type,
    groundingContext,
  };
}

/** Resolve the account's winning-pattern lines relevant to this ad brief (RAG),
 *  tenancy-checked through resolveTenant — the SAME boundary the /api/patterns
 *  routes use. Project-gated like resolveBrandContext: no projectId → `[]`, so the
 *  demo / no-project path (and its cache entry) is byte-identical to before. The
 *  lines enter the request → the input-hash cache key, so a real library serves
 *  fresh + tenant-scoped and can't collide with another account's same-brief ad.
 *  Query embeddings are content-cached (lib/patterns/embeddings), so a repeat that
 *  hits the response cache re-embeds nothing. */
export async function resolveAdPatterns(
  projectId: string | undefined,
  userId: string | null,
  req: { product: string; benefits: string; audience: string }
): Promise<string[]> {
  if (!projectId) return [];
  const tenant = await resolveTenant(userId, projectId);
  const { pnoGoal } = await getClientProfile(tenant);
  // projectId is threaded so the tenant's LIVE LP-experiment winners (project-scoped)
  // join the tenant-scoped pattern grounding — an account-proven creative angle from a
  // real, significant experiment. Sample/demo projects persist no experiments → no-op.
  return getPatternLines(tenant, adPatternQuery(req), 6, pnoGoal, projectId);
}

/** B1 — resolve a project's brand grounding (what it sells + how it talks) for the
 *  content tools (brief, article-draft), with the same demo-public / user-owned
 *  tenancy as resolveGrounding. Returns "" when there's no project or no catalogue,
 *  so the prompt stays byte-identical to the ungrounded path. Reuses the shared
 *  loadBrandContext the social/WeekPlanner endpoints already use, so all content
 *  surfaces ground from one derivation. */
export async function resolveBrandContext(
  projectId: string | undefined,
  userId: string | null,
  locale: SupportedLocale
): Promise<string> {
  const access = await resolveProjectAccess(projectId, userId);
  if (access.kind === "none") return "";
  return loadBrandContext(access.project, locale);
}

/** D4: the account's lead-quality / CVR grounding for LP-experiment hypotheses,
 *  tenancy-checked (demo public, real id owner-only). Leadgen/local only (else the
 *  summary is null). keyId keys the cache by the effective project. */
export async function resolveLeadGrounding(
  projectId: string | undefined,
  userId: string | null
): Promise<{ text?: string; keyId: string }> {
  const access = await resolveProjectAccess(projectId, userId);
  if (access.kind === "none") return { keyId: "base" };
  return { text: (await resolveLeadSignalsPromptText(access.project)) ?? undefined, keyId: access.project.id };
}
