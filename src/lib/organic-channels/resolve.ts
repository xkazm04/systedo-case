/** Data-source seam for the organic-channels plan. `resolveOrganicChannels`
 *  returns the project's pinned AI plan when it has one, else the seeded sample —
 *  the single place the Kanály module flips sample→tailored — and always merges in
 *  the tracked per-channel status (the checklist state). Mirrors
 *  local-signals/resolve. Server-only (reads the organic-channels store). */
import "server-only";
import { getOrganicChannels } from "./store";
import { sanitizeChannelState, type ChannelTrack, type OrganicChannel } from "./types";

export interface ResolvedChannels {
  /** the active plan: the pinned AI plan when present, else the seeded sample */
  channels: OrganicChannel[];
  /** channelId -> tracked lifecycle; a missing id means "identified" */
  tracks: Record<string, ChannelTrack>;
  /** "sample" (seeded, illustrative) or "ai" (a plan the user generated + pinned) */
  source: "sample" | "ai";
  /** true when the store READ failed (not the same as "never tracked"): the sample
   *  is shown as a stand-in but any pinned plan/status may still exist. The UI must
   *  surface this and refuse status writes so a save can't clobber the real state. */
  degraded: boolean;
  /** ISO timestamp of the last save, when there is saved state */
  updatedAt?: string;
}

/** The active channel plan + statuses for a project: the pinned AI plan when the
 *  project has one, else the passed seeded sample. `sample` is computed by the
 *  caller (channelPlanForProject) so this stays free of the catalog plumbing. */
export async function resolveOrganicChannels(
  projectId: string,
  sample: OrganicChannel[]
): Promise<ResolvedChannels> {
  let state = null;
  let degraded = false;
  try {
    state = await getOrganicChannels(projectId);
  } catch {
    // Store read failed. Show the sample as a stand-in, but flag `degraded` so the
    // caller can distinguish this from a genuine "never tracked" empty state and
    // refuse status writes — a save here would overwrite the (still-present) real plan.
    degraded = true;
  }
  if (!state) {
    return { channels: sample, tracks: {}, source: "sample", degraded };
  }
  // Re-sanitize on read: coerces the stored blob AND migrates pre-lifecycle blobs
  // (flat `statuses` strings) onto the ChannelTrack shape in one pass.
  const clean = sanitizeChannelState(state);
  const pinned = clean.plan && clean.plan.length > 0;
  return {
    channels: pinned ? clean.plan! : sample,
    tracks: clean.tracks,
    // `planSource` is the stored provenance of the pinned plan ("ai" is the only
    // value today, and the sanitizer stamps it whenever a plan is stored).
    source: pinned ? (clean.planSource ?? "ai") : "sample",
    degraded: false,
    updatedAt: state.updatedAt,
  };
}
