/** Resolve a project's onboarding progress by reading the real stores — every
 *  step's "done" is a live signal (scan applied, catalog saved, Ads linked, ranks
 *  imported, channels started), never a stored checkbox. This is what makes the
 *  checklist self-complete as the user connects data. Server-only. */
import "server-only";
import type { Project } from "@/lib/projects/types";
import { stepsForType, type OnboardingStepDef, type OnboardingStepKey } from "./steps";
import { getOnboarding, saveOnboarding } from "./store";
import type { OnboardingScanProfile, OnboardingState } from "./types";
import { recordOnboardingActivation } from "@/lib/analytics/track";
import { listOfferings } from "@/lib/catalog/store";
import { getLocalSignals } from "@/lib/local-signals/store";
import { getOrganicChannels } from "@/lib/organic-channels/store";
import { getAdsConnection } from "@/lib/campaigns/connection";
import { getCostModel } from "@/lib/cost-model/store";

export interface ResolvedStep extends OnboardingStepDef {
  done: boolean;
}

export interface OnboardingProgress {
  steps: ResolvedStep[];
  done: number;
  total: number;
  scanApplied: boolean;
  dismissed: boolean;
  /** true when the onboarding-state read itself FAILED (transient store error), as
   *  opposed to a fresh project with no saved state. `dismissed`/`scanApplied` are then
   *  unreliable (they read false on failure), so the caller should keep the previous
   *  render / hide the card rather than resurfacing a dismissed card or regressing steps. */
  stateUnknown: boolean;
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

  const [stateRes, offerings, ranks, channels, adsConn, costModel] = await Promise.all([
    // Tagged read: this one carries PERSISTED USER INTENT (dismissed / scanApplied), where
    // "read failed" and "no state yet" mean very different things — catch-to-null would
    // conflate them and flap a dismissed card back on. The other five probes are derived
    // signals where not-done is a safe default, so they keep the catch-to-null policy.
    getOnboarding(project.id).then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const, value: null })
    ),
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
    need.has("costModel") ? getCostModel(project.id).catch(() => null) : Promise.resolve(null),
  ]);

  const state = stateRes.value;
  const stateUnknown = !stateRes.ok;
  const scanApplied = !!state?.scanApplied;
  const catalogDone = Array.isArray(offerings) && offerings.length > 0;
  const adsDone = !!project.adsCustomerId || !!adsConn?.customerId;
  // The local-signals store now carries three importable sections (rank ladder,
  // reviews, GBP) — ANY of them present means the user has imported local data.
  const ranksDone =
    !!ranks &&
    (ranks.ladder.length > 0 ||
      (ranks.reviews?.items.length ?? 0) > 0 ||
      (ranks.gbp?.rows.length ?? 0) > 0);
  // Any tracked lifecycle (or a legacy pre-track statuses blob) counts as touched.
  const channelsDone =
    !!channels &&
    (Object.keys(channels.tracks ?? (channels as { statuses?: object }).statuses ?? {}).length > 0 ||
      (channels.plan?.length ?? 0) > 0);
  const costModelDone = !!costModel;

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
      case "costModel":
        return costModelDone;
    }
  };

  const steps: ResolvedStep[] = defs.map((d) => ({ ...d, done: doneOf(d.key) }));
  const done = steps.filter((s) => s.done).length;
  const complete = done === steps.length;

  // The `onboarding_activated` transition: this computation is the ONLY place
  // "all steps done" exists (each step's done is derived live, never stored), so
  // the first time it observes complete it stamps the durable `activatedAt`
  // marker and bumps the first-party activation counter — once per project, ever.
  // Guarded by the marker (not memory) so re-renders/deploys don't double-count,
  // and by stateRes.ok so a failed state read can't mis-stamp. Best-effort: a
  // hiccup here must never break the progress read; an un-stamped complete just
  // retries on the next computation.
  if (complete && stateRes.ok && !state?.activatedAt) {
    const now = new Date().toISOString();
    const next: OnboardingState = { ...(state ?? {}), activatedAt: now, updatedAt: now };
    try {
      await saveOnboarding(project.id, next);
      await recordOnboardingActivation();
    } catch (err) {
      console.error("[onboarding] activation stamp failed (non-fatal):", err);
    }
  }

  return {
    steps,
    done,
    total: steps.length,
    scanApplied,
    dismissed: !!state?.dismissed,
    stateUnknown,
    ...(state?.scan ? { scan: state.scan } : {}),
    complete,
  };
}
