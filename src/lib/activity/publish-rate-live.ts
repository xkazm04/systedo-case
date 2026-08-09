/** Live per-project AI-content publish rate: joins the two halves that were both
 *  already being written and never read — `llmTelemetry` (the generations) and the
 *  tenant activity feed (the publishes) — through the pure rollup in
 *  ./publish-rate. Server-only so the clock read + backend access stay out of
 *  render.
 *
 *  LIVE-VS-SAMPLE INTEGRITY: this reader has NO seed and NO fallback. A demo /
 *  sample project resolves to `measurable: false` and renders an honest
 *  "not measured here" state, and a real project with no events yet resolves to a
 *  rollup whose status is "no-generations" — never a fabricated percentage. There
 *  is deliberately no code path that can produce a rate from anything but recorded
 *  events.
 *
 *  `ok` is false only when a backend read FAILED (an outage), which is distinct
 *  from an empty window — the surface says "temporarily unavailable" instead of
 *  showing 0 generations as if that were measured. */
import "server-only";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listActivitySince } from "@/lib/campaigns/activity";
import { listLlmTelemetryForProject } from "@/lib/llm/telemetry";
import { isDemoProjectId } from "@/lib/projects/demo";
import { isPublishAssetKind } from "./publish";
import {
  DEFAULT_PUBLISH_WINDOW_DAYS,
  publishRateRollup,
  type GenerationEvent,
  type PublishEvent,
  type PublishRateRollup,
} from "./publish-rate";

export interface LivePublishRate {
  /** null when the project cannot be measured (demo/sample) or a read failed. */
  rollup: PublishRateRollup | null;
  /** false for a demo/sample project — nothing is measured there, by design. */
  measurable: boolean;
  /** false only on a backend read FAILURE (never for an empty window). */
  ok: boolean;
}

export async function livePublishRateForProject(
  userId: string | null,
  projectId: string,
  windowDays = DEFAULT_PUBLISH_WINDOW_DAYS
): Promise<LivePublishRate> {
  // A demo project's numbers are illustrative by construction; producing a publish
  // rate for it would be exactly the "sample data that reads as measured" the repo
  // forbids. Refuse to measure rather than measure something meaningless.
  if (!userId || isDemoProjectId(projectId)) return { rollup: null, measurable: false, ok: true };

  const sinceIso = new Date(Date.now() - windowDays * 86_400_000).toISOString();

  let generations: GenerationEvent[];
  try {
    // Project-scoped telemetry read (the same one the spend rollup uses), so the
    // denominator is this project's own generations and nothing else.
    const telemetry = await listLlmTelemetryForProject(projectId, sinceIso);
    generations = telemetry.map((e) => ({ toolId: e.toolId, at: e.at }));
  } catch {
    return { rollup: null, measurable: true, ok: false };
  }

  // Activity lives under the account-agnostic tenant key (see activity/emit).
  const tenant = await resolveTenant(userId, projectId, { accountScoped: false });
  const { records, ok } = await listActivitySince(tenant, sinceIso);
  if (!ok) return { rollup: null, measurable: true, ok: false };

  // ONLY rows that carry the structured publish taxonomy count. The "Příspěvek
  // naplánován" promise and a failed publish carry no taxonomy (see
  // socialPostPublishFields), so they are invisible here by construction rather
  // than by a title match that could rot.
  const publishes: PublishEvent[] = records
    .filter((r) => isPublishAssetKind(r.publishKind))
    .map((r) => ({
      kind: r.publishKind as PublishEvent["kind"],
      at: r.at,
      // The simulated tag rides the same row (see socialPostPublishFields) — carried
      // so the rollup can report the real-vs-simulated split of the same events.
      ...(r.publishSimulated === true ? { simulated: true } : {}),
    }));

  return { rollup: publishRateRollup(generations, publishes, { windowDays }), measurable: true, ok: true };
}
