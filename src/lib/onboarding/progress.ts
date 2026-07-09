/** Resolve a project's onboarding progress by reading the real stores — every
 *  step's "done" is a live signal (scan applied, catalog saved, Ads linked, ranks
 *  imported, channels started), never a stored checkbox. This is what makes the
 *  checklist self-complete as the user connects data. Server-only. */
import "server-only";
import type { Project } from "@/lib/projects/types";
import { stepsForType, type OnboardingStepDef, type OnboardingStepKey } from "./steps";
import { getOnboarding } from "./store";
import type { OnboardingScanProfile } from "./types";
import { listOfferings } from "@/lib/catalog/store";
import { getLocalSignals } from "@/lib/local-signals/store";
import { getOrganicChannels } from "@/lib/organic-channels/store";
import { getAdsConnection } from "@/lib/campaigns/connection";

export interface ResolvedStep extends OnboardingStepDef {
  done: boolean;
}

export interface OnboardingProgress {
  steps: ResolvedStep[];
  done: number;
  total: number;
  scanApplied: boolean;
  dismissed: boolean;
  /** the applied scan profile, when one exists */
  scan?: OnboardingScanProfile;
  /** true when every step is done */
  complete: boolean;
}

/** Compute the live per-step status for a project's onboarding checklist. Reads are
 *  best-effort — a store hiccup marks the step not-done rather than breaking the
 *  page. `userId` is needed for the (user+project)-scoped catalog store. */
export async function resolveOnboardingProgress(
  project: Project,
  userId: string | null
): Promise<OnboardingProgress> {
  const defs = stepsForType(project.type);
  const need = new Set(defs.map((d) => d.key));

  const [state, offerings, ranks, channels, adsConn] = await Promise.all([
    getOnboarding(project.id).catch(() => null),
    userId && need.has("catalog")
      ? listOfferings(userId, project.id).catch(() => null)
      : Promise.resolve(null),
    need.has("ranks") ? getLocalSignals(project.id).catch(() => null) : Promise.resolve(null),
    need.has("channels") ? getOrganicChannels(project.id).catch(() => null) : Promise.resolve(null),
    // Ads is "connected" via the project's linked customer id OR the user's active
    // connected account — the same fallback integrations/status.ts and report-metrics/sync.ts
    // use. Skip the read when a project-level id already settles it.
    userId && need.has("ads") && !project.adsCustomerId
      ? getAdsConnection(userId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const scanApplied = !!state?.scanApplied;
  const catalogDone = Array.isArray(offerings) && offerings.length > 0;
  const adsDone = !!project.adsCustomerId || !!adsConn?.customerId;
  const ranksDone = !!ranks && ranks.ladder.length > 0;
  const channelsDone =
    !!channels && (Object.keys(channels.statuses ?? {}).length > 0 || (channels.plan?.length ?? 0) > 0);

  const doneOf = (key: OnboardingStepKey): boolean => {
    switch (key) {
      case "scan":
        return scanApplied;
      case "catalog":
        return catalogDone;
      case "ads":
        return adsDone;
      case "ranks":
        return ranksDone;
      case "channels":
        return channelsDone;
    }
  };

  const steps: ResolvedStep[] = defs.map((d) => ({ ...d, done: doneOf(d.key) }));
  const done = steps.filter((s) => s.done).length;
  return {
    steps,
    done,
    total: steps.length,
    scanApplied,
    dismissed: !!state?.dismissed,
    ...(state?.scan ? { scan: state.scan } : {}),
    complete: done === steps.length,
  };
}
