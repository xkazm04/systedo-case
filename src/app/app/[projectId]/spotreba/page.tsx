/** Spotřeba / Usage — LLM spend by operation and model over a period. Reads the
 *  live llmTelemetry rollup for this project (recorded at recordLlmCall, attributed
 *  via the request context); falls back to seeded data when there is no telemetry
 *  yet (e.g. local/dev, where Firestore isn't written). Account-level.
 *
 *  Also carries the AI-content publish rate — the payoff half of the same loop
 *  (what was generated here vs. what actually left the app). That panel is
 *  measured-only: it has no seeded variant and never inherits this page's sample
 *  fallback, so a demo project or an empty window says so instead of showing a
 *  number that would read as measured. */
import { requireProjectModule } from "@/lib/projects/guard";
import { currentUserId } from "@/lib/session";
import ModulePage from "@/components/app/ModulePage";
import SpendModule from "@/components/app/modules/SpendModule";
import PublishRatePanel from "@/components/app/PublishRatePanel";
import DataUnavailableNote from "@/components/app/DataUnavailableNote";
import { spendForProject } from "@/lib/spend/sample";
import { liveSpendForProject } from "@/lib/spend/live";
import { livePublishRateForProject } from "@/lib/activity/publish-rate-live";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project } = await requireProjectModule(projectId, "spotreba");

  const { entries: live, ok } = await liveSpendForProject(project.id);
  // Read FAILED (outage) — show an honest unavailable state rather than seeded
  // spend that would masquerade as the tenant's real LLM usage.
  if (!ok) {
    return (
      <ModulePage moduleKey="spotreba">
        <DataUnavailableNote />
      </ModulePage>
    );
  }
  const isLive = live.length > 0;
  const entries = isLive ? live : spendForProject(project);

  const userId = await currentUserId();
  const publishRate = await livePublishRateForProject(userId, project.id);

  return (
    <ModulePage moduleKey="spotreba" sample={!isLive}>
      <div className="space-y-5">
        {/* The publish-rate read carries its own `ok`: an outage there degrades to
            the honest unavailable note rather than to a fabricated rate, and never
            blanks the spend module below. */}
        {publishRate.ok ? (
          <PublishRatePanel rollup={publishRate.rollup} measurable={publishRate.measurable} />
        ) : (
          <DataUnavailableNote />
        )}
        <SpendModule entries={entries} isLive={isLive} />
      </div>
    </ModulePage>
  );
}
